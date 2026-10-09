package com.kkume.server.auth;

import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CopyOnWriteArrayList;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.BDDMockito.given;
import static org.mockito.BDDMockito.willThrow;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

import com.kkume.server.TestcontainersConfiguration;
import com.kkume.server.audio.FakeAudioStorage;
import com.kkume.server.auth.AppleAccountClient.AppleGrant;
import com.kkume.server.user.Provider;

/**
 * Sign in with Apple(모바일 075 · 서버 076) — 로그인 규칙은 구글과 같고, 애플 계정을 지울 때 애플 토큰을 회수한다.
 */
@Import({ TestcontainersConfiguration.class, AppleAuthApiTest.Fakes.class })
@SpringBootTest(properties = "kkume.stt.worker-enabled=false")
@AutoConfigureMockMvc
class AppleAuthApiTest {

	/** 애플 REST 대신. 받은 코드 → 돌려줄 결과를 정해 두고, 회수한 것을 모은다 */
	static class FakeApple implements AppleAccountClient {

		volatile boolean enabled = true;

		final Map<String, Object> codes = new java.util.concurrent.ConcurrentHashMap<>();

		final List<String> exchanged = new CopyOnWriteArrayList<>();

		final List<AppleGrant> revoked = new CopyOnWriteArrayList<>();

		@Override
		public boolean enabled() {
			return this.enabled;
		}

		@Override
		public AppleGrant exchange(String authorizationCode) {
			this.exchanged.add(authorizationCode);
			Object result = this.codes.get(authorizationCode);
			if (result instanceof RuntimeException ex) {
				throw ex;
			}
			if (result == null) {
				throw new AppleCodeRejectedException("모르는 코드");
			}
			return (AppleGrant) result;
		}

		@Override
		public void revoke(AppleGrant grant) {
			this.revoked.add(grant);
		}
	}

	@TestConfiguration(proxyBeanMethods = false)
	static class Fakes {

		@Bean
		@Primary
		FakeApple fakeApple() {
			return new FakeApple();
		}

		@Bean
		@Primary
		FakeAudioStorage fakeAudioStorage() {
			return new FakeAudioStorage();
		}
	}

	@Autowired
	private MockMvc mockMvc;

	@Autowired
	private JdbcTemplate jdbc;

	@Autowired
	private FakeApple apple;

	@MockitoBean
	private AppleTokenVerifier appleVerifier;

	@MockitoBean
	private GoogleTokenVerifier googleVerifier;

	private record Who(String id, String token, String appleSub) {
	}

	@BeforeEach
	void reset() {
		this.apple.enabled = true;
		this.apple.codes.clear();
		this.apple.exchanged.clear();
		this.apple.revoked.clear();
	}

	// ---------------------------------------------------------------- 도우미

	private ResultActions appleLogin(String sub, String consentVersion) throws Exception {
		given(this.appleVerifier.verify(anyString())).willReturn(new SocialIdentity(Provider.APPLE, sub));
		String body = consentVersion == null ? "{\"identityToken\":\"t\"}"
				: "{\"identityToken\":\"t\",\"consentVersion\":\"" + consentVersion + "\"}";
		return this.mockMvc.perform(post("/api/auth/apple").contentType(MediaType.APPLICATION_JSON).content(body));
	}

	private Who appleUser() throws Exception {
		String sub = "001234." + UUID.randomUUID() + ".0102";
		String r = appleLogin(sub, "2026-10-07").andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
		return new Who(JsonPath.read(r, "$.user.id"), JsonPath.read(r, "$.accessToken"), sub);
	}

	private ResultActions deleteMe(Who who, String json) throws Exception {
		var req = delete("/api/me").header("Authorization", "Bearer " + who.token());
		if (json != null) {
			req = req.contentType(MediaType.APPLICATION_JSON).content(json);
		}
		return this.mockMvc.perform(req);
	}

	private boolean deleted(Who who) {
		return this.jdbc.queryForObject("select deleted_at is not null from users where id = ?", Boolean.class,
				UUID.fromString(who.id()));
	}

	private static String code(ResultActions r) throws Exception {
		return JsonPath.read(r.andReturn().getResponse().getContentAsString(), "$.code");
	}

	// ---------------------------------------------------------------- 로그인 (01장)

	@Test
	void 애플로_처음_로그인하면_애플_계정이_만들어지고_동의가_기록된다() throws Exception {
		Who me = appleUser();

		this.mockMvc.perform(get("/api/me").header("Authorization", "Bearer " + me.token()))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.provider").value("apple"))
			.andExpect(jsonPath("$.consentVersion").value("2026-10-07"));
		Map<String, Object> row = this.jdbc.queryForMap("select provider, provider_id from users where id = ?",
				UUID.fromString(me.id()));
		assertThat(row).containsEntry("provider", "apple").containsEntry("provider_id", me.appleSub());
	}

	@Test
	void 계정이_없는데_동의도_없으면_403_consent_required이고_아무것도_쓰지_않는다() throws Exception {
		String sub = "001234." + UUID.randomUUID() + ".0102";
		assertThat(code(appleLogin(sub, null).andExpect(status().isForbidden()))).isEqualTo("consent_required");
		assertThat(this.jdbc.queryForObject("select count(*) from users where provider_id = ?", Integer.class, sub)).isZero();

		// 같은 토큰에 동의를 붙여 다시 보내면 만들어진다
		appleLogin(sub, "2026-10-07").andExpect(status().isOk());
		// 이미 있으면 동의 없이도 로그인
		appleLogin(sub, null).andExpect(status().isOk());
		assertThat(this.jdbc.queryForObject("select count(*) from users where provider_id = ?", Integer.class, sub)).isEqualTo(1);
	}

	@Test
	void 판정_순서는_동의_버전_400_그다음_애플_토큰_401이다() throws Exception {
		willThrow(new InvalidSocialTokenException("x")).given(this.appleVerifier).verify(anyString());

		ResultActions badVersion = this.mockMvc.perform(post("/api/auth/apple").contentType(MediaType.APPLICATION_JSON)
			.content("{\"identityToken\":\"t\",\"consentVersion\":\"v2\"}")).andExpect(status().isBadRequest());
		assertThat(code(badVersion)).isEqualTo("invalid_consent_version");

		ResultActions badToken = this.mockMvc.perform(post("/api/auth/apple").contentType(MediaType.APPLICATION_JSON)
			.content("{\"identityToken\":\"t\"}")).andExpect(status().isUnauthorized());
		assertThat(code(badToken)).isEqualTo("invalid_token");

		this.mockMvc.perform(post("/api/auth/apple").contentType(MediaType.APPLICATION_JSON).content("{}"))
			.andExpect(status().isUnauthorized());
	}

	@Test
	void 같은_애플_sub라도_구글_계정과는_다른_계정이다() throws Exception {
		Who apple = appleUser();
		given(this.googleVerifier.verify(anyString())).willReturn(new SocialIdentity(Provider.GOOGLE, apple.appleSub()));
		String r = this.mockMvc.perform(post("/api/auth/google").contentType(MediaType.APPLICATION_JSON)
			.content("{\"idToken\":\"x\",\"consentVersion\":\"2026-10-07\"}")).andExpect(status().isOk())
			.andReturn().getResponse().getContentAsString();

		assertThat(JsonPath.<String>read(r, "$.user.id")).isNotEqualTo(apple.id());
	}

	// ---------------------------------------------------------------- 계정 삭제 · 회수 (02장)

	@Test
	void 애플_계정을_지우면_코드를_바꿔_같은_사람인지_보고_지운_뒤_회수한다() throws Exception {
		Who me = appleUser();
		AppleGrant grant = new AppleGrant(me.appleSub(), "rt", "at");
		this.apple.codes.put("code-ok", grant);

		deleteMe(me, "{\"appleAuthorizationCode\":\"code-ok\"}").andExpect(status().isNoContent());

		assertThat(deleted(me)).isTrue();
		assertThat(this.apple.revoked).containsExactly(grant);
	}

	@Test
	void 애플_계정인데_코드가_없으면_400_apple_reauth_required이고_지우지_않는다() throws Exception {
		Who me = appleUser();

		assertThat(code(deleteMe(me, null).andExpect(status().isBadRequest()))).isEqualTo("apple_reauth_required");
		assertThat(code(deleteMe(me, "{}").andExpect(status().isBadRequest()))).isEqualTo("apple_reauth_required");
		assertThat(deleted(me)).isFalse();
		assertThat(this.apple.exchanged).isEmpty();
	}

	@Test
	void 애플이_코드를_거절하면_400_apple_reauth_required이고_지우지_않는다() throws Exception {
		Who me = appleUser();

		assertThat(code(deleteMe(me, "{\"appleAuthorizationCode\":\"expired\"}").andExpect(status().isBadRequest())))
			.isEqualTo("apple_reauth_required");
		assertThat(deleted(me)).isFalse();
		assertThat(this.apple.revoked).isEmpty();
	}

	@Test
	void 다른_애플_ID로_인증했으면_400_apple_account_mismatch이고_지우지_않는다() throws Exception {
		Who me = appleUser();
		this.apple.codes.put("someone-else", new AppleGrant("000999.other.0102", "rt", "at"));

		assertThat(code(deleteMe(me, "{\"appleAuthorizationCode\":\"someone-else\"}").andExpect(status().isBadRequest())))
			.isEqualTo("apple_account_mismatch");
		assertThat(deleted(me)).isFalse();
		assertThat(this.apple.revoked).isEmpty();
	}

	@Test
	void 애플에_닿지_못하면_503_deletion_failed이고_지우지_않는다() throws Exception {
		Who me = appleUser();
		this.apple.codes.put("down", new AppleAccountClient.AppleUnavailableException("애플 장애", null));

		assertThat(code(deleteMe(me, "{\"appleAuthorizationCode\":\"down\"}").andExpect(status().isServiceUnavailable())))
			.isEqualTo("deletion_failed");
		assertThat(deleted(me)).isFalse();
	}

	@Test
	void 회수용_키가_없으면_코드는_받되_교환_회수를_건너뛰고_지운다() throws Exception {
		Who me = appleUser();
		this.apple.enabled = false;

		// 요청 모양은 키와 무관하게 같다 — 키를 넣는 날 앱을 바꾸지 않아도 되게
		assertThat(code(deleteMe(me, null).andExpect(status().isBadRequest()))).isEqualTo("apple_reauth_required");

		deleteMe(me, "{\"appleAuthorizationCode\":\"anything\"}").andExpect(status().isNoContent());
		assertThat(deleted(me)).isTrue();
		assertThat(this.apple.exchanged).isEmpty();
		assertThat(this.apple.revoked).isEmpty();
	}

	@Test
	void 구글_계정은_지금처럼_본문_없이_지우고_애플을_부르지_않는다() throws Exception {
		given(this.googleVerifier.verify(anyString())).willReturn(new SocialIdentity(Provider.GOOGLE, "g-" + UUID.randomUUID()));
		String r = this.mockMvc.perform(post("/api/auth/google").contentType(MediaType.APPLICATION_JSON)
			.content("{\"idToken\":\"x\",\"consentVersion\":\"2026-10-07\"}")).andReturn().getResponse().getContentAsString();
		Who google = new Who(JsonPath.read(r, "$.user.id"), JsonPath.read(r, "$.accessToken"), null);

		deleteMe(google, null).andExpect(status().isNoContent());

		assertThat(deleted(google)).isTrue();
		assertThat(this.apple.exchanged).isEmpty();
		verify(this.appleVerifier, never()).verify(anyString());
	}

	@Test
	void 지운_뒤_같은_애플_ID로_오면_consent_required이고_동의하면_새_계정이다() throws Exception {
		Who me = appleUser();
		this.apple.codes.put("ok", new AppleGrant(me.appleSub(), "rt", null));
		deleteMe(me, "{\"appleAuthorizationCode\":\"ok\"}").andExpect(status().isNoContent());

		assertThat(code(appleLogin(me.appleSub(), null).andExpect(status().isForbidden()))).isEqualTo("consent_required");
		String r = appleLogin(me.appleSub(), "2026-10-07").andExpect(status().isOk()).andReturn().getResponse()
			.getContentAsString();
		assertThat(JsonPath.<String>read(r, "$.user.id")).isNotEqualTo(me.id());
	}
}
