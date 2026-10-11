package com.kkume.server.comic;

import java.time.Duration;
import java.util.Base64;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.content;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.jsonPath;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

import tools.jackson.databind.json.JsonMapper;

/** Workers AI 호출 모양과 오류 가르기(문서 081 06장 · 082 호출 기록) */
class CloudflareComicAiTest {

	private static final String BASE = "https://api.cloudflare.com/client/v4/accounts/acc-1/ai";

	private MockRestServiceServer server;

	private CloudflareComicAi ai;

	@BeforeEach
	void setUp() {
		RestClient.Builder builder = RestClient.builder();
		this.server = MockRestServiceServer.bindTo(builder).build();
		this.ai = new CloudflareComicAi(builder, JsonMapper.builder().build(), new ComicProperties.Cloudflare("acc-1",
				"tok-1", "@cf/openai/gpt-oss-120b", "@cf/black-forest-labs/flux-2-klein-4b", Duration.ofSeconds(90)));
	}

	@Test
	void 대본은_OpenAI_호환_엔드포인트로_보내고_토큰_사용량으로_금액을_센다() {
		this.server.expect(requestTo(BASE + "/v1/chat/completions"))
			.andExpect(method(HttpMethod.POST))
			.andExpect(header("Authorization", "Bearer tok-1"))
			.andExpect(jsonPath("$.model").value("@cf/openai/gpt-oss-120b"))
			.andExpect(jsonPath("$.reasoning_effort").value("low"))
			.andExpect(jsonPath("$.max_tokens").value(4000))
			.andExpect(jsonPath("$.messages[0].role").value("system"))
			.andExpect(jsonPath("$.messages[1].content").value("꿈"))
			.andRespond(withSuccess("""
					{"choices":[{"message":{"content":"{\\"character\\":\\"x\\"}"}}],
					 "usage":{"prompt_tokens":1000,"completion_tokens":2000}}""", MediaType.APPLICATION_JSON));

		ComicAi.Reply<String> r = this.ai.script("system", "꿈");
		assertThat(r.value()).isEqualTo("{\"character\":\"x\"}");
		assertThat(r.usage().inputTokens()).isEqualTo(1000);
		assertThat(r.usage().outputTokens()).isEqualTo(2000);
		// 1000 × 0.35/M + 2000 × 0.75/M
		assertThat(r.usage().usd()).isEqualByComparingTo("0.00185");
	}

	@Test
	void 그림은_multipart_로_보내고_base64_JPEG_를_푼다() {
		byte[] jpeg = { (byte) 0xFF, (byte) 0xD8, 1, 2 };
		this.server.expect(requestTo(BASE + "/run/@cf/black-forest-labs/flux-2-klein-4b"))
			.andExpect(method(HttpMethod.POST))
			.andExpect(content().contentTypeCompatibleWith(MediaType.MULTIPART_FORM_DATA))
			.andRespond(withSuccess("{\"result\":{\"image\":\"" + Base64.getEncoder().encodeToString(jpeg)
					+ "\"},\"success\":true}", MediaType.APPLICATION_JSON));

		ComicAi.Reply<byte[]> r = this.ai.draw("prompt");
		assertThat(r.value()).containsExactly(jpeg);
		assertThat(r.usage().images()).isEqualTo(1);
		assertThat(r.usage().usd()).isEqualByComparingTo("0.001148");
	}

	@Test
	void 코드_8007_은_거절이다() {
		this.server.expect(requestTo(BASE + "/run/@cf/black-forest-labs/flux-2-klein-4b"))
			.andRespond(withStatus(HttpStatus.BAD_REQUEST).contentType(MediaType.APPLICATION_JSON).body("""
					{"errors":[{"message":"AiError: AiError: Input prompt contains NSFW content.","code":8007}],"success":false}"""));
		assertThatThrownBy(() -> this.ai.draw("p")).isInstanceOfSatisfying(ComicAiException.class, ex -> {
			assertThat(ex.kind()).isEqualTo(ComicAiException.Kind.REFUSED);
			assertThat(ex.code()).isEqualTo("cf_8007");
			assertThat(ex.usage().usd()).isZero();
		});
	}

	@Test
	void 코드_3036_은_무료_한도_초과다() {
		this.server.expect(requestTo(BASE + "/v1/chat/completions"))
			.andRespond(withStatus(HttpStatus.TOO_MANY_REQUESTS).contentType(MediaType.APPLICATION_JSON).body("""
					{"errors":[{"message":"You have used up your daily free allocation of 10,000 neurons","code":3036}],"success":false}"""));
		assertThatThrownBy(() -> this.ai.script("s", "u")).isInstanceOfSatisfying(ComicAiException.class,
				ex -> assertThat(ex.kind()).isEqualTo(ComicAiException.Kind.BUDGET));
	}

	@Test
	void 그_밖의_오류는_실패이고_본문이_JSON_이_아니면_상태_코드로_남긴다() {
		this.server.expect(requestTo(BASE + "/run/@cf/black-forest-labs/flux-2-klein-4b"))
			.andRespond(withStatus(HttpStatus.BAD_GATEWAY).body("<html>bad gateway</html>"));
		assertThatThrownBy(() -> this.ai.draw("p")).isInstanceOfSatisfying(ComicAiException.class, ex -> {
			assertThat(ex.kind()).isEqualTo(ComicAiException.Kind.FAILED);
			assertThat(ex.code()).isEqualTo("http_502");
			// 토큰은 메시지에 들어가지 않는다
			assertThat(ex.getMessage()).doesNotContain("tok-1");
		});
	}

	@Test
	void 일시적_용량_부족_3040_도_실패로_끝난다() {
		this.server.expect(requestTo(BASE + "/run/@cf/black-forest-labs/flux-2-klein-4b"))
			.andRespond(withStatus(HttpStatus.TOO_MANY_REQUESTS).contentType(MediaType.APPLICATION_JSON)
				.body("{\"errors\":[{\"message\":\"Capacity temporarily exceeded\",\"code\":3040}]}"));
		assertThatThrownBy(() -> this.ai.draw("p")).isInstanceOfSatisfying(ComicAiException.class, ex -> {
			assertThat(ex.kind()).isEqualTo(ComicAiException.Kind.FAILED);
			assertThat(ex.code()).isEqualTo("cf_3040");
		});
	}

	@Test
	void 그림_응답에_이미지가_없으면_실패() {
		this.server.expect(requestTo(BASE + "/run/@cf/black-forest-labs/flux-2-klein-4b"))
			.andRespond(withSuccess("{\"result\":{},\"success\":true}", MediaType.APPLICATION_JSON));
		assertThatThrownBy(() -> this.ai.draw("p")).isInstanceOfSatisfying(ComicAiException.class,
				ex -> assertThat(ex.code()).isEqualTo("empty_image"));
	}
}
