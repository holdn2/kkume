package com.kkume.server.moderation;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CopyOnWriteArrayList;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.BDDMockito.given;
import static org.mockito.BDDMockito.willThrow;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
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
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import com.kkume.server.TestcontainersConfiguration;
import com.kkume.server.audio.FakeAudioStorage;
import com.kkume.server.auth.GoogleTokenVerifier;
import com.kkume.server.auth.InvalidSocialTokenException;
import com.kkume.server.auth.SocialIdentity;
import com.kkume.server.user.Provider;

/**
 * 가입 동의 기록 · 이용 정지 · 신고 알림. 계약은 문서 070 · 072(모바일 071에서 수용).
 */
@Import({ TestcontainersConfiguration.class, ConsentAndModerationTest.Fakes.class })
@SpringBootTest(properties = "kkume.stt.worker-enabled=false")
@AutoConfigureMockMvc
class ConsentAndModerationTest {

	/** 보낸 알림을 모아 둔다. 알림은 요청과 따로 가므로 테스트는 조금 기다린다 */
	static class CapturingNotifier implements ReportNotifier {

		final List<ReportEvent> sent = new CopyOnWriteArrayList<>();

		volatile boolean fail;

		@Override
		public void notify(ReportEvent event) {
			if (this.fail) {
				throw new IllegalStateException("가짜 SNS 실패");
			}
			this.sent.add(event);
		}
	}

	@TestConfiguration(proxyBeanMethods = false)
	static class Fakes {

		@Bean
		@Primary
		CapturingNotifier capturingNotifier() {
			return new CapturingNotifier();
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
	private CapturingNotifier notifier;

	@MockitoBean
	private GoogleTokenVerifier googleVerifier;

	private record Who(String id, String token) {
	}

	@BeforeEach
	void reset() {
		this.notifier.sent.clear();
		this.notifier.fail = false;
	}

	// ---------------------------------------------------------------- 도우미

	private ResultActions loginRaw(String googleSub, String consentVersion) throws Exception {
		given(this.googleVerifier.verify(anyString())).willReturn(new SocialIdentity(Provider.GOOGLE, googleSub));
		String body = consentVersion == null ? "{\"idToken\":\"x\"}"
				: "{\"idToken\":\"x\",\"consentVersion\":\"" + consentVersion + "\"}";
		return this.mockMvc.perform(post("/api/auth/google").contentType(MediaType.APPLICATION_JSON).content(body));
	}

	private Who login() throws Exception {
		String r = loginRaw("google-sub-" + UUID.randomUUID(), "2026-10-07").andExpect(status().isOk())
			.andReturn().getResponse().getContentAsString();
		return new Who(JsonPath.read(r, "$.user.id"), JsonPath.read(r, "$.accessToken"));
	}

	/** V5 전에 만들어져 동의 기록이 없는 계정. 이제 로그인으로는 만들 수 없어 기록을 지워 흉내 낸다 */
	private Who legacy() throws Exception {
		Who who = login();
		this.jdbc.update("update users set consent_version = null, consented_at = null where id = ?", UUID.fromString(who.id()));
		return who;
	}

	private ResultActions call(Who who, MockHttpServletRequestBuilder req) throws Exception {
		return this.mockMvc.perform(req.header("Authorization", "Bearer " + who.token()));
	}

	private ResultActions call(Who who, MockHttpServletRequestBuilder req, String json) throws Exception {
		return this.mockMvc.perform(req.header("Authorization", "Bearer " + who.token())
			.contentType(MediaType.APPLICATION_JSON).content(json));
	}

	private static String code(ResultActions r) throws Exception {
		return JsonPath.read(r.andReturn().getResponse().getContentAsString(), "$.code");
	}

	private Map<String, Object> userRow(Who who) {
		return this.jdbc.queryForMap("select consent_version, consented_at, suspended_at from users where id = ?",
				UUID.fromString(who.id()));
	}

	private String share(Who who) throws Exception {
		String dreamId = "d-" + UUID.randomUUID().toString().substring(0, 12);
		call(who, post("/api/sync/dreams"), """
				{"dreams":[{"id":"%s","recordedAt":"2026-10-07T21:00:00.000Z","title":"꿈","text":"꿈 내용",
				"updatedAt":"2026-10-07T21:01:00.000Z"}]}""".formatted(dreamId)).andExpect(status().isOk());
		return JsonPath.read(call(who, post("/api/community/posts"), """
				{"dreamId":"%s","title":"t","dreamText":"꿈 내용","dreamRecordedAt":"2026-10-07T21:00:00.000Z","body":""}"""
			.formatted(dreamId)).andExpect(status().isCreated()).andReturn().getResponse().getContentAsString(), "$.id");
	}

	private ResultActions report(Who who, String type, String id, String reason) throws Exception {
		return call(who, post("/api/community/reports"),
				"{\"type\":\"%s\",\"id\":\"%s\",\"reason\":\"%s\"}".formatted(type, id, reason));
	}

	private void suspend(Who who) {
		this.jdbc.update("update users set suspended_at = now() where id = ?", UUID.fromString(who.id()));
	}

	/** 알림은 커밋 뒤 따로 간다. 2초 안에 n 개가 모이길 기다린다 */
	private List<ReportEvent> awaitAlerts(int n) throws InterruptedException {
		long until = System.currentTimeMillis() + 2_000;
		while (this.notifier.sent.size() < n && System.currentTimeMillis() < until) {
			Thread.sleep(20);
		}
		return List.copyOf(this.notifier.sent);
	}

	// ---------------------------------------------------------------- 동의 (02장)

	@Test
	void PUT_동의는_처음_시각을_덮지_않고_옛_버전으로_내리지_않는다() throws Exception {
		Who me = legacy();
		assertThat(JsonPath.<Object>read(call(me, get("/api/me")).andReturn().getResponse().getContentAsString(),
				"$.consentVersion")).isNull();

		call(me, put("/api/me/consent"), "{\"version\":\"2026-10-07\"}").andExpect(status().isNoContent());
		Object first = userRow(me).get("consented_at");

		call(me, put("/api/me/consent"), "{\"version\":\"2026-10-07\"}").andExpect(status().isNoContent());
		assertThat(userRow(me).get("consented_at")).isEqualTo(first);

		call(me, put("/api/me/consent"), "{\"version\":\"2026-09-01\"}").andExpect(status().isNoContent());
		assertThat(userRow(me).get("consent_version")).isEqualTo("2026-10-07");

		call(me, put("/api/me/consent"), "{\"version\":\"2026-12-01\"}").andExpect(status().isNoContent());
		assertThat(userRow(me).get("consent_version")).isEqualTo("2026-12-01");
		assertThat(JsonPath.<String>read(call(me, get("/api/me")).andReturn().getResponse().getContentAsString(),
				"$.consentVersion")).isEqualTo("2026-12-01");
	}

	@Test
	void 동의_버전_모양이_틀리면_400이다() throws Exception {
		Who me = login();
		for (String bad : List.of("1.0", "2026-10-7", "2026-13-01", "2026-02-30", "")) {
			assertThat(code(call(me, put("/api/me/consent"), "{\"version\":\"" + bad + "\"}").andExpect(status().isBadRequest())))
				.isEqualTo("invalid_consent_version");
		}
	}

	@Test
	void 로그인_요청의_동의는_계정과_함께_기록되고_응답에_실린다() throws Exception {
		String sub = "google-sub-" + UUID.randomUUID();
		String r = loginRaw(sub, "2026-10-07").andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
		assertThat(JsonPath.<String>read(r, "$.user.consentVersion")).isEqualTo("2026-10-07");
		Who me = new Who(JsonPath.read(r, "$.user.id"), JsonPath.read(r, "$.accessToken"));
		assertThat(userRow(me).get("consented_at")).isNotNull();

		// 다시 로그인하면서 동의 없이 와도(옛 앱) 기록은 그대로다
		String again = loginRaw(sub, null).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
		assertThat(JsonPath.<String>read(again, "$.user.consentVersion")).isEqualTo("2026-10-07");
	}

	@Test
	void 로그인_요청의_동의_버전이_틀리면_400이고_계정을_만들지_않는다() throws Exception {
		String sub = "google-sub-" + UUID.randomUUID();
		assertThat(code(loginRaw(sub, "v2").andExpect(status().isBadRequest()))).isEqualTo("invalid_consent_version");
		Integer n = this.jdbc.queryForObject("select count(*) from users where provider_id = ?", Integer.class, sub);
		assertThat(n).isZero();
	}

	// ---------------------------------------------------------------- 계정을 고른 뒤에 동의 (074)

	@Test
	void 계정이_없는데_동의도_없으면_403_consent_required이고_아무것도_쓰지_않는다() throws Exception {
		String sub = "google-sub-" + UUID.randomUUID();
		Integer settingsBefore = this.jdbc.queryForObject("select count(*) from user_settings", Integer.class);

		ResultActions r = loginRaw(sub, null).andExpect(status().isForbidden());
		assertThat(code(r)).isEqualTo("consent_required");
		assertThat(JsonPath.<String>read(r.andReturn().getResponse().getContentAsString(), "$.message"))
			.isEqualTo("가입하려면 이용약관과 개인정보 수집 · 이용에 동의해 주세요");

		assertThat(this.jdbc.queryForObject("select count(*) from users where provider_id = ?", Integer.class, sub)).isZero();
		assertThat(this.jdbc.queryForObject("select count(*) from user_settings", Integer.class)).isEqualTo(settingsBefore);
	}

	@Test
	void consent_required를_받고_같은_토큰에_동의를_붙여_다시_보내면_계정이_생긴다() throws Exception {
		String sub = "google-sub-" + UUID.randomUUID();
		loginRaw(sub, null).andExpect(status().isForbidden());

		String r = loginRaw(sub, "2026-10-07").andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
		assertThat(JsonPath.<String>read(r, "$.user.consentVersion")).isEqualTo("2026-10-07");
		assertThat(this.jdbc.queryForObject("select count(*) from users where provider_id = ?", Integer.class, sub)).isEqualTo(1);
	}

	@Test
	void 동의_기록이_없는_기존_계정은_동의_없이도_로그인된다() throws Exception {
		Who me = legacy();
		String sub = (String) this.jdbc.queryForMap("select provider_id from users where id = ?", UUID.fromString(me.id())).get("provider_id");

		String r = loginRaw(sub, null).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
		assertThat(JsonPath.<String>read(r, "$.user.id")).isEqualTo(me.id());
		assertThat(JsonPath.<Object>read(r, "$.user.consentVersion")).isNull();
	}

	@Test
	void 구글_토큰이_틀리면_계정이_없어도_consent_required가_아니라_401이다() throws Exception {
		// 토큰을 검증한 뒤에만 "꾸메 계정이 없다"를 알려 준다 — 남의 구글 계정이 가입했는지 떠보지 못하게
		willThrow(new InvalidSocialTokenException("x")).given(this.googleVerifier).verify(anyString());
		ResultActions r = this.mockMvc.perform(post("/api/auth/google").contentType(MediaType.APPLICATION_JSON)
			.content("{\"idToken\":\"x\"}")).andExpect(status().isUnauthorized());
		assertThat(code(r)).isEqualTo("invalid_token");
	}

	@Test
	void 지운_뒤_동의_없이_다시_로그인하면_consent_required이고_동의하면_새_계정이다() throws Exception {
		String sub = "google-sub-" + UUID.randomUUID();
		String r = loginRaw(sub, "2026-10-07").andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
		Who old = new Who(JsonPath.read(r, "$.user.id"), JsonPath.read(r, "$.accessToken"));
		call(old, delete("/api/me")).andExpect(status().isNoContent());

		assertThat(code(loginRaw(sub, null).andExpect(status().isForbidden()))).isEqualTo("consent_required");

		String again = loginRaw(sub, "2026-10-07").andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
		assertThat(JsonPath.<String>read(again, "$.user.id")).isNotEqualTo(old.id());
	}

	// ---------------------------------------------------------------- 이용 정지 (03장)

	@Test
	void 정지된_계정은_글_댓글_공감_닉네임이_403이고_문구에_문의처가_있다() throws Exception {
		Who other = login();
		String otherPost = share(other);
		Who me = login();
		String dreamId = "d-" + UUID.randomUUID().toString().substring(0, 12);
		call(me, post("/api/sync/dreams"), """
				{"dreams":[{"id":"%s","recordedAt":"2026-10-07T21:00:00.000Z","title":"꿈","text":"꿈",
				"updatedAt":"2026-10-07T21:01:00.000Z"}]}""".formatted(dreamId)).andExpect(status().isOk());
		suspend(me);

		ResultActions r = call(me, post("/api/community/posts"), """
				{"dreamId":"%s","title":"t","dreamText":"꿈","dreamRecordedAt":"2026-10-07T21:00:00.000Z","body":""}"""
			.formatted(dreamId)).andExpect(status().isForbidden());
		assertThat(code(r)).isEqualTo("account_suspended");
		assertThat(JsonPath.<String>read(r.andReturn().getResponse().getContentAsString(), "$.message"))
			.isEqualTo("이용이 제한된 계정입니다. 문의: yoocy01@gmail.com");

		assertThat(code(call(me, post("/api/community/posts/" + otherPost + "/comments"), "{\"body\":\"x\"}")
			.andExpect(status().isForbidden()))).isEqualTo("account_suspended");
		assertThat(code(call(me, put("/api/community/posts/" + otherPost + "/like"), "{\"liked\":true}")
			.andExpect(status().isForbidden()))).isEqualTo("account_suspended");
		assertThat(code(call(me, patch("/api/me"), "{\"nickname\":\"새 이름\"}").andExpect(status().isForbidden())))
			.isEqualTo("account_suspended");
	}

	@Test
	void 정지돼도_신고_차단_읽기_동기화_동의_계정삭제는_된다() throws Exception {
		Who other = login();
		String otherPost = share(other);
		Who me = login();
		suspend(me);

		report(me, "post", otherPost, "spam").andExpect(status().isNoContent());
		call(me, put("/api/community/blocks/" + other.id())).andExpect(status().isNoContent());
		call(me, get("/api/community/posts")).andExpect(status().isOk());
		call(me, post("/api/sync/dreams"), """
				{"dreams":[{"id":"d-%s","recordedAt":"2026-10-07T21:00:00.000Z","title":"꿈","text":"비공개 꿈",
				"updatedAt":"2026-10-07T21:01:00.000Z"}]}""".formatted(UUID.randomUUID().toString().substring(0, 12)))
			.andExpect(status().isOk());
		call(me, put("/api/me/consent"), "{\"version\":\"2026-10-07\"}").andExpect(status().isNoContent());
		call(me, delete("/api/me")).andExpect(status().isNoContent());
	}

	@Test
	void 계정을_지우면_동의_기록과_정지_기록을_비운다() throws Exception {
		String r = loginRaw("google-sub-" + UUID.randomUUID(), "2026-10-07").andReturn().getResponse().getContentAsString();
		Who me = new Who(JsonPath.read(r, "$.user.id"), JsonPath.read(r, "$.accessToken"));
		suspend(me);

		call(me, delete("/api/me")).andExpect(status().isNoContent());

		Map<String, Object> row = userRow(me);
		assertThat(row.get("consent_version")).isNull();
		assertThat(row.get("consented_at")).isNull();
		assertThat(row.get("suspended_at")).isNull();
	}

	// ---------------------------------------------------------------- 신고 알림 (03장)

	@Test
	void 신고하면_알림이_가고_같은_사람의_두_번째는_가지_않으며_세_번째에_자동_가림이_붙는다() throws Exception {
		Who author = login();
		String postId = share(author);
		Who a = login();

		report(a, "post", postId, "spam").andExpect(status().isNoContent());
		report(a, "post", postId, "spam").andExpect(status().isNoContent());
		report(login(), "post", postId, "violence").andExpect(status().isNoContent());
		report(login(), "post", postId, "other").andExpect(status().isNoContent());

		List<ReportEvent> sent = awaitAlerts(3);
		Thread.sleep(200);
		assertThat(this.notifier.sent).hasSize(3);
		assertThat(sent).extracting(ReportEvent::reporters).containsExactly(1, 2, 3);
		assertThat(sent).extracting(ReportEvent::autoHidden).containsExactly(false, false, true);
		assertThat(sent).extracting(ReportEvent::reason).containsExactly("spam", "violence", "other");
		assertThat(sent.get(0).targetId()).isEqualTo(UUID.fromString(postId));
	}

	@Test
	void 알림이_실패해도_신고는_저장되고_204다() throws Exception {
		Who author = login();
		String postId = share(author);
		this.notifier.fail = true;

		report(login(), "post", postId, "spam").andExpect(status().isNoContent());

		Integer n = this.jdbc.queryForObject("select count(*) from reports where target_id = ?", Integer.class,
				UUID.fromString(postId));
		assertThat(n).isEqualTo(1);
	}

	@Test
	void 거절된_신고는_알림이_가지_않는다() throws Exception {
		Who author = login();
		String postId = share(author);

		report(author, "post", postId, "spam").andExpect(status().isBadRequest());
		report(login(), "post", postId, "boring").andExpect(status().isBadRequest());

		Thread.sleep(300);
		assertThat(this.notifier.sent).isEmpty();
	}

	// ---------------------------------------------------------------- 메일 모양

	@Test
	void 메일_제목은_ASCII뿐이고_본문에는_이용자_글자가_없다() {
		UUID id = UUID.randomUUID();
		ReportEvent e = new ReportEvent("post", id, "spam", 3, true, Instant.parse("2026-10-07T12:14:00Z"));

		String subject = ReportMessage.subject(e, 3);
		assertThat(subject).isEqualTo("[AUTO-HIDDEN] [kkume report] post / spam / 3 of 3");
		assertThat(subject.chars().allMatch(c -> c < 128)).isTrue();
		assertThat(subject.length()).isLessThan(100);

		String body = ReportMessage.body(e, 3);
		assertThat(body).contains(id.toString()).contains("스팸 · 광고").contains("2026-10-07 21:14 KST")
			.contains("./moderate.sh show post " + id);
	}
}
