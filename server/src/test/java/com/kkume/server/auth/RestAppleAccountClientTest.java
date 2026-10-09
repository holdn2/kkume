package com.kkume.server.auth;

import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.util.Arrays;
import java.util.Map;
import java.util.stream.Collectors;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withBadRequest;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withServerError;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.mock.http.client.MockClientHttpRequest;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

import com.kkume.server.auth.AppleAccountClient.AppleGrant;

/**
 * 애플 REST API 를 부르는 모양 — 어디로, 어떤 폼으로, 애플의 오류를 어떻게 가르는지.
 */
class RestAppleAccountClientTest {

	private MockRestServiceServer apple;

	private RestAppleAccountClient client;

	private final Map<String, Map<String, String>> sent = new java.util.HashMap<>();

	@BeforeEach
	void setUp() throws Exception {
		RestClient.Builder builder = RestClient.builder();
		this.apple = MockRestServiceServer.bindTo(builder).build();
		AppleClientSecret secret = new AppleClientSecret("3PW3FZG3GR", "com.holdn2.kkume", "ABC123DEFG",
				AppleClientSecretTest.p8(AppleClientSecretTest.keyPair()), Clock.systemUTC());
		this.client = new RestAppleAccountClient(builder, secret, "com.holdn2.kkume", AppleTokenVerifierTest.verifier());
	}

	private org.springframework.test.web.client.RequestMatcher capture(String name) {
		return request -> this.sent.put(name, form(((MockClientHttpRequest) request).getBodyAsString()));
	}

	private static Map<String, String> form(String body) {
		return Arrays.stream(body.split("&")).map(kv -> kv.split("=", 2))
			.collect(Collectors.toMap(kv -> kv[0], kv -> URLDecoder.decode(kv[1], StandardCharsets.UTF_8)));
	}

	@Test
	void 인가_코드를_토큰으로_바꾸고_ID_토큰의_sub를_돌려준다() {
		String idToken = AppleTokenVerifierTest.validToken("001234.abcd.0102");
		this.apple.expect(requestTo("https://appleid.apple.com/auth/token")).andExpect(method(HttpMethod.POST))
			.andExpect(capture("token"))
			.andRespond(withSuccess("{\"access_token\":\"at\",\"token_type\":\"Bearer\",\"expires_in\":3600,"
					+ "\"refresh_token\":\"rt\",\"id_token\":\"" + idToken + "\"}", MediaType.APPLICATION_JSON));

		AppleGrant grant = this.client.exchange("code-1");

		assertThat(grant.subject()).isEqualTo("001234.abcd.0102");
		assertThat(grant.refreshToken()).isEqualTo("rt");
		Map<String, String> form = this.sent.get("token");
		assertThat(form).containsEntry("grant_type", "authorization_code").containsEntry("code", "code-1")
			.containsEntry("client_id", "com.holdn2.kkume").containsKey("client_secret");
		// 토큰이 로그에 찍히지 않는다
		assertThat(grant.toString()).doesNotContain("rt").doesNotContain("at,");
	}

	@Test
	void 애플이_invalid_grant로_거절하면_다시_인증하면_되는_실패다() {
		this.apple.expect(requestTo("https://appleid.apple.com/auth/token"))
			.andRespond(withBadRequest().body("{\"error\":\"invalid_grant\"}").contentType(MediaType.APPLICATION_JSON));

		assertThatThrownBy(() -> this.client.exchange("used"))
			.isInstanceOf(AppleAccountClient.AppleCodeRejectedException.class);
	}

	@Test
	void invalid_client나_애플_장애는_다시_인증해도_소용없는_실패다() {
		this.apple.expect(requestTo("https://appleid.apple.com/auth/token"))
			.andRespond(withBadRequest().body("{\"error\":\"invalid_client\"}").contentType(MediaType.APPLICATION_JSON));
		assertThatThrownBy(() -> this.client.exchange("c")).isInstanceOf(AppleAccountClient.AppleUnavailableException.class);

		this.apple.reset();
		this.apple.expect(requestTo("https://appleid.apple.com/auth/token")).andRespond(withServerError());
		assertThatThrownBy(() -> this.client.exchange("c")).isInstanceOf(AppleAccountClient.AppleUnavailableException.class);
	}

	@Test
	void 교환_응답의_ID_토큰이_검증되지_않으면_쓰지_않는다() {
		String otherApp = AppleTokenVerifierTest.token("https://appleid.apple.com", "com.someone.else", "s",
				java.time.Instant.now().plusSeconds(600));
		this.apple.expect(requestTo("https://appleid.apple.com/auth/token"))
			.andRespond(withSuccess("{\"refresh_token\":\"rt\",\"id_token\":\"" + otherApp + "\"}", MediaType.APPLICATION_JSON));

		assertThatThrownBy(() -> this.client.exchange("c")).isInstanceOf(AppleAccountClient.AppleUnavailableException.class);
	}

	@Test
	void 회수는_refresh_token을_보낸다() {
		this.apple.expect(requestTo("https://appleid.apple.com/auth/revoke")).andExpect(method(HttpMethod.POST))
			.andExpect(capture("revoke")).andRespond(withSuccess());

		this.client.revoke(new AppleGrant("s", "rt", "at"));

		this.apple.verify();
		assertThat(this.sent.get("revoke")).containsEntry("token", "rt").containsEntry("token_type_hint", "refresh_token")
			.containsEntry("client_id", "com.holdn2.kkume").containsKey("client_secret");
	}

	@Test
	void refresh_token이_없으면_access_token을_회수한다() {
		this.apple.expect(requestTo("https://appleid.apple.com/auth/revoke")).andExpect(capture("revoke"))
			.andRespond(withSuccess());

		this.client.revoke(new AppleGrant("s", null, "at"));

		assertThat(this.sent.get("revoke")).containsEntry("token", "at").containsEntry("token_type_hint", "access_token");
	}

	@Test
	void 회수가_실패해도_던지지_않는다() {
		this.apple.expect(requestTo("https://appleid.apple.com/auth/revoke")).andRespond(withServerError());

		assertThatCode(() -> this.client.revoke(new AppleGrant("s", "rt", null))).doesNotThrowAnyException();
	}
}
