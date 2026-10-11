package com.kkume.server.comic;

import java.math.BigDecimal;
import java.net.http.HttpClient;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.springframework.http.MediaType;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestClientResponseException;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * Cloudflare Workers AI(무료 플랜, 하루 10,000뉴런 — 문서 081 06장 · 082).
 *
 * <ul>
 * <li>대본: OpenAI 호환 {@code POST /ai/v1/chat/completions}. {@code reasoning_effort: low}, {@code max_tokens 4000}
 * <li>그림: {@code POST /ai/run/{model}} multipart(prompt · width · height). 응답 {@code result.image}가 base64 JPEG
 * </ul>
 *
 * <p>오류 본문의 {@code errors[].code}로 가른다. 8007(NSFW)은 거절, 3036(무료 한도 다 씀)은 한도 초과, 그 밖은 실패.
 * 토큰은 로그 · 예외 메시지에 넣지 않는다.
 */
class CloudflareComicAi implements ComicAi {

	static final int IMAGE_SIZE = 1024;

	private static final int NSFW = 8007;

	private static final int ACCOUNT_LIMITED = 3036;

	private final RestClient http;

	private final JsonMapper json;

	private final ComicProperties.Cloudflare config;

	/** 운영. 응답 시한을 건 JDK 클라이언트로 Cloudflare 에 붙는다 */
	static CloudflareComicAi create(RestClient.Builder http, JsonMapper json, ComicProperties.Cloudflare config) {
		JdkClientHttpRequestFactory factory = new JdkClientHttpRequestFactory(
				HttpClient.newBuilder().connectTimeout(java.time.Duration.ofSeconds(10)).build());
		factory.setReadTimeout(config.timeout());
		return new CloudflareComicAi(http.clone().requestFactory(factory), json, config);
	}

	/** {@code http}의 요청 방식을 그대로 쓴다 — 테스트는 가짜 서버에 묶은 빌더를 넘긴다 */
	CloudflareComicAi(RestClient.Builder http, JsonMapper json, ComicProperties.Cloudflare config) {
		this.http = http
			.baseUrl("https://api.cloudflare.com/client/v4/accounts/" + config.accountId() + "/ai")
			.defaultHeader("Authorization", "Bearer " + config.apiToken())
			.build();
		this.json = json;
		this.config = config;
	}

	@Override
	public Reply<String> script(String system, String user) {
		Map<String, Object> body = new LinkedHashMap<>();
		body.put("model", this.config.scriptModel());
		body.put("messages", List.of(Map.of("role", "system", "content", system), Map.of("role", "user", "content", user)));
		body.put("max_tokens", 4000);
		body.put("reasoning_effort", "low");

		long started = System.nanoTime();
		JsonNode reply;
		try {
			String raw = this.http.post().uri("/v1/chat/completions").contentType(MediaType.APPLICATION_JSON).body(body)
				.retrieve().body(String.class);
			reply = this.json.readTree(raw == null ? "{}" : raw);
		}
		catch (RestClientResponseException ex) {
			throw failure("script", this.config.scriptModel(), ex, elapsed(started));
		}
		catch (RestClientException ex) {
			throw unreachable("script", this.config.scriptModel(), ex, elapsed(started));
		}

		JsonNode usage = reply.path("usage");
		Integer in = usage.has("prompt_tokens") ? usage.get("prompt_tokens").asInt() : null;
		Integer out = usage.has("completion_tokens") ? usage.get("completion_tokens").asInt() : null;
		Usage u = new Usage("script", this.config.scriptModel(), in, out, 0, ComicPricing.script(in, out), elapsed(started));
		String content = reply.path("choices").path(0).path("message").path("content").asString("");
		return new Reply<>(content, u);
	}

	@Override
	public Reply<byte[]> draw(String prompt) {
		MultiValueMap<String, Object> form = new LinkedMultiValueMap<>();
		form.add("prompt", prompt);
		form.add("width", String.valueOf(IMAGE_SIZE));
		form.add("height", String.valueOf(IMAGE_SIZE));

		long started = System.nanoTime();
		String raw;
		try {
			raw = this.http.post().uri("/run/" + this.config.imageModel()).contentType(MediaType.MULTIPART_FORM_DATA)
				.body(form).retrieve().body(String.class);
		}
		catch (RestClientResponseException ex) {
			throw failure("image", this.config.imageModel(), ex, elapsed(started));
		}
		catch (RestClientException ex) {
			throw unreachable("image", this.config.imageModel(), ex, elapsed(started));
		}

		Usage u = new Usage("image", this.config.imageModel(), null, null, 1,
				ComicPricing.image(IMAGE_SIZE, IMAGE_SIZE), elapsed(started));
		JsonNode reply = this.json.readTree(raw == null ? "{}" : raw);
		String b64 = reply.path("result").path("image").asString("");
		if (b64.isEmpty()) {
			throw new ComicAiException(ComicAiException.Kind.FAILED, "empty_image", "그림 응답에 이미지가 없습니다", u, null);
		}
		try {
			return new Reply<>(Base64.getDecoder().decode(b64), u);
		}
		catch (IllegalArgumentException ex) {
			throw new ComicAiException(ComicAiException.Kind.FAILED, "bad_image", "그림 응답을 읽지 못했습니다", u, ex);
		}
	}

	private ComicAiException failure(String step, String model, RestClientResponseException ex, long ms) {
		// 거절된 호출은 청구되지 않는다(082 호출 기록의 $0.0000). 사용량 0으로 한 줄 남긴다
		Usage u = new Usage(step, model, null, null, 0, BigDecimal.ZERO, ms);
		int code = errorCode(ex.getResponseBodyAsString());
		String label = code > 0 ? "cf_" + code : "http_" + ex.getStatusCode().value();
		String message = "Workers AI " + step + " 실패 status=" + ex.getStatusCode().value() + " code=" + code;
		if (code == NSFW) {
			return new ComicAiException(ComicAiException.Kind.REFUSED, label, message, u, ex);
		}
		if (code == ACCOUNT_LIMITED) {
			return new ComicAiException(ComicAiException.Kind.BUDGET, label, message, u, ex);
		}
		return new ComicAiException(ComicAiException.Kind.FAILED, label, message, u, ex);
	}

	private static ComicAiException unreachable(String step, String model, RestClientException ex, long ms) {
		Usage u = new Usage(step, model, null, null, 0, BigDecimal.ZERO, ms);
		String label = ex instanceof ResourceAccessException ? "network" : "client_error";
		return new ComicAiException(ComicAiException.Kind.FAILED, label, "Workers AI " + step + " — 닿지 못함", u, ex);
	}

	/** {@code {"errors":[{"code":8007,...}]}}의 첫 코드. 읽을 수 없으면 0 */
	int errorCode(String body) {
		try {
			JsonNode errors = this.json.readTree(body == null || body.isBlank() ? "{}" : body).path("errors");
			for (JsonNode e : errors) {
				if (e.path("code").canConvertToInt() && e.path("code").asInt() != 0) {
					return e.path("code").asInt();
				}
			}
		}
		catch (RuntimeException ex) {
			// 본문이 JSON 이 아니다(게이트웨이 오류 페이지 등) — 상태 코드로 남긴다
		}
		return 0;
	}

	private static long elapsed(long started) {
		return (System.nanoTime() - started) / 1_000_000;
	}
}
