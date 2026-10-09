package com.kkume.server.auth;

import java.util.Map;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.MediaType;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestClientResponseException;

/**
 * 애플 REST API({@code /auth/token} · {@code /auth/revoke})로 교환 · 회수한다.
 *
 * <p>교환으로 받은 ID 토큰은 TLS 로 애플에게서 바로 받은 것이지만 로그인 때와 같은 검증기를 그대로 탄다 —
 * {@code sub}를 계정과 대조하는 근거라 서명 · 대상까지 본다.
 */
public class RestAppleAccountClient implements AppleAccountClient {

	private static final Logger log = LoggerFactory.getLogger(RestAppleAccountClient.class);

	private final RestClient http;

	private final AppleClientSecret secret;

	private final String clientId;

	private final AppleTokenVerifier verifier;

	public RestAppleAccountClient(RestClient.Builder http, AppleClientSecret secret, String clientId,
			AppleTokenVerifier verifier) {
		this.http = http.baseUrl("https://appleid.apple.com").build();
		this.secret = secret;
		this.clientId = clientId;
		this.verifier = verifier;
	}

	@Override
	public boolean enabled() {
		return true;
	}

	@Override
	public AppleGrant exchange(String authorizationCode) {
		MultiValueMap<String, String> form = form();
		form.add("grant_type", "authorization_code");
		form.add("code", authorizationCode);

		Map<?, ?> body;
		try {
			body = this.http.post().uri("/auth/token").contentType(MediaType.APPLICATION_FORM_URLENCODED)
				.body(form).retrieve().body(Map.class);
		}
		catch (RestClientResponseException ex) {
			// invalid_grant: 코드가 만료됐거나 이미 썼거나 이 앱의 것이 아니다 — 다시 인증하면 된다.
			// 그 밖(invalid_client 등)은 우리 키 · 설정 문제라 다시 인증해도 소용없다
			if (ex.getStatusCode().value() == 400 && ex.getResponseBodyAsString().contains("invalid_grant")) {
				throw new AppleCodeRejectedException("애플이 인가 코드를 거절했습니다");
			}
			throw new AppleUnavailableException("애플 토큰 교환 실패 status=" + ex.getStatusCode().value() + " error="
					+ errorOf(ex), ex);
		}
		catch (RestClientException ex) {
			throw new AppleUnavailableException("애플 토큰 교환 — 애플에 닿지 못함", ex);
		}

		String idToken = body == null ? null : (String) body.get("id_token");
		if (idToken == null) {
			throw new AppleUnavailableException("애플 토큰 교환 응답에 id_token 이 없습니다", null);
		}
		SocialIdentity identity;
		try {
			identity = this.verifier.verify(idToken);
		}
		catch (InvalidSocialTokenException ex) {
			throw new AppleUnavailableException("애플 토큰 교환 응답의 id_token 검증 실패", ex);
		}
		return new AppleGrant(identity.providerId(), (String) body.get("refresh_token"), (String) body.get("access_token"));
	}

	@Override
	public void revoke(AppleGrant grant) {
		boolean refresh = grant.refreshToken() != null;
		String token = refresh ? grant.refreshToken() : grant.accessToken();
		if (token == null) {
			log.warn("애플 토큰 회수 — 회수할 토큰이 없음 {}", grant);
			return;
		}
		MultiValueMap<String, String> form = form();
		form.add("token", token);
		form.add("token_type_hint", refresh ? "refresh_token" : "access_token");
		try {
			this.http.post().uri("/auth/revoke").contentType(MediaType.APPLICATION_FORM_URLENCODED)
				.body(form).retrieve().toBodilessEntity();
			log.info("애플 토큰 회수 완료 {}", grant);
		}
		catch (RestClientResponseException ex) {
			log.warn("애플 토큰 회수 실패 {} status={} error={}", grant, ex.getStatusCode().value(), errorOf(ex));
		}
		catch (RestClientException ex) {
			log.warn("애플 토큰 회수 실패 — 애플에 닿지 못함 {}", grant, ex);
		}
	}

	private MultiValueMap<String, String> form() {
		MultiValueMap<String, String> form = new LinkedMultiValueMap<>();
		form.add("client_id", this.clientId);
		form.add("client_secret", this.secret.create());
		return form;
	}

	/** 애플 오류 본문은 {@code {"error":"invalid_client"}} 모양이다. 길게 찍지 않는다 */
	private static String errorOf(RestClientResponseException ex) {
		String body = ex.getResponseBodyAsString();
		return body.length() > 200 ? body.substring(0, 200) : body;
	}
}
