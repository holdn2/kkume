package com.kkume.server.user;

import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.BDDMockito.given;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;

import org.junit.jupiter.api.AfterEach;
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
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.transaction.support.TransactionTemplate;

import com.kkume.server.TestcontainersConfiguration;
import com.kkume.server.audio.FakeAudioStorage;
import com.kkume.server.auth.GoogleTokenVerifier;
import com.kkume.server.auth.SocialIdentity;

/**
 * 계정 삭제(MY-5)를 로그인부터 끝까지 돌린다. 계약은 문서 064 · 066(모바일 065에서 수용).
 *
 * <p>폰의 기록은 남고 서버의 기록은 지운다. 지운 계정의 토큰은 모든 경로에서 {@code 401 account_deleted}다.
 */
@Import({ TestcontainersConfiguration.class, AccountDeletionTest.Fakes.class })
@SpringBootTest(properties = "kkume.stt.worker-enabled=false")
@AutoConfigureMockMvc
class AccountDeletionTest {

	@TestConfiguration(proxyBeanMethods = false)
	static class Fakes {

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
	private TransactionTemplate transactions;

	@Autowired
	private FakeAudioStorage storage;

	@Autowired
	private AccountDeletionService deletion;

	@MockitoBean
	private GoogleTokenVerifier googleVerifier;

	private record Who(String id, String token, String googleSub) {
	}

	@AfterEach
	void storageWorks() {
		this.storage.failDeletes(false);
	}

	// ---------------------------------------------------------------- 도우미

	private Who login() throws Exception {
		return login("google-sub-" + UUID.randomUUID());
	}

	private Who login(String googleSub) throws Exception {
		given(this.googleVerifier.verify(anyString())).willReturn(new SocialIdentity(Provider.GOOGLE, googleSub));
		String r = this.mockMvc
			.perform(post("/api/auth/google").contentType(MediaType.APPLICATION_JSON).content("{\"idToken\":\"x\",\"consentVersion\":\"2026-10-07\"}"))
			.andExpect(status().isOk())
			.andReturn().getResponse().getContentAsString();
		return new Who(JsonPath.read(r, "$.user.id"), JsonPath.read(r, "$.accessToken"), googleSub);
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

	private static String pushBody(String dreamId, String text) {
		return """
				{"dreams":[{"id":"%s","recordedAt":"2026-10-06T21:00:00.000Z","title":"꿈","text":"%s",
				"durationMs":60000,"updatedAt":"2026-10-06T21:01:00.000Z"}]}""".formatted(dreamId, text);
	}

	private String dream(Who who) throws Exception {
		String id = "d-" + UUID.randomUUID().toString().substring(0, 12);
		call(who, post("/api/sync/dreams"), pushBody(id, "서버에 올린 꿈")).andExpect(status().isOk());
		return id;
	}

	private String share(Who who, String dreamId) throws Exception {
		return JsonPath.read(call(who, post("/api/community/posts"), """
				{"dreamId":"%s","title":"나눈 제목","dreamText":"나눈 꿈 내용","dreamRecordedAt":"2026-10-06T21:00:00.000Z","body":"한마디"}"""
			.formatted(dreamId)).andExpect(status().isCreated()).andReturn().getResponse().getContentAsString(), "$.id");
	}

	private String comment(Who who, String postId, String parentId) throws Exception {
		String parent = parentId == null ? "null" : "\"" + parentId + "\"";
		return JsonPath.read(call(who, post("/api/community/posts/" + postId + "/comments"),
				"{\"body\":\"댓글 내용\",\"parentId\":" + parent + "}")
			.andExpect(status().isCreated()).andReturn().getResponse().getContentAsString(), "$.id");
	}

	/** 녹음을 올린 것처럼 만들고 그 키를 돌려준다 */
	private String upload(Who who, String dreamId) throws Exception {
		String key = JsonPath.read(call(who, post("/api/dreams/" + dreamId + "/audio/upload"))
			.andExpect(status().isOk()).andReturn().getResponse().getContentAsString(), "$.key");
		this.storage.put(key, 1_000_000);
		call(who, post("/api/dreams/" + dreamId + "/audio/complete"), "{\"key\":\"" + key + "\"}").andExpect(status().isOk());
		return key;
	}

	private int count(String sql, Object... args) {
		Integer n = this.jdbc.queryForObject(sql, Integer.class, args);
		return n == null ? 0 : n;
	}

	// ---------------------------------------------------------------- 응답

	@Test
	void 지우면_204이고_같은_토큰은_모든_경로에서_401_account_deleted다() throws Exception {
		Who me = login();
		call(me, delete("/api/me")).andExpect(status().isNoContent());

		assertThat(code(call(me, get("/api/me")).andExpect(status().isUnauthorized()))).isEqualTo("account_deleted");
		assertThat(code(call(me, get("/api/sync/dreams")).andExpect(status().isUnauthorized()))).isEqualTo("account_deleted");
		assertThat(code(call(me, post("/api/sync/dreams"), pushBody("late", "x")).andExpect(status().isUnauthorized())))
			.isEqualTo("account_deleted");
		// 로그인 없이 되는 읽기도 토큰을 붙였으면 막는다
		assertThat(code(call(me, get("/api/community/posts")).andExpect(status().isUnauthorized()))).isEqualTo("account_deleted");
		// 다시 눌러도 같은 답이 아니라 account_deleted — 앱은 이것을 성공으로 마무리한다
		assertThat(code(call(me, delete("/api/me")).andExpect(status().isUnauthorized()))).isEqualTo("account_deleted");
	}

	@Test
	void 토큰_없이_지우려_하면_401_unauthorized다() throws Exception {
		ResultActions r = this.mockMvc.perform(delete("/api/me")).andExpect(status().isUnauthorized());
		assertThat(code(r)).isEqualTo("unauthorized");
	}

	// ---------------------------------------------------------------- 무엇을 지우나

	@Test
	void 꿈_기록과_녹음과_설정은_실제로_지운다() throws Exception {
		Who me = login();
		String dreamId = dream(me);
		String key = upload(me, dreamId);
		// complete 하지 않고 버려진 업로드도 같은 자리에 있다
		String abandoned = "audio/" + me.id() + "/" + dreamId + "/" + UUID.randomUUID() + ".m4a";
		this.storage.put(abandoned, 10);

		call(me, delete("/api/me")).andExpect(status().isNoContent());

		UUID id = UUID.fromString(me.id());
		assertThat(count("select count(*) from dreams where user_id = ?", id)).isZero();
		assertThat(count("select count(*) from jobs where user_id = ?", id)).isZero();
		assertThat(count("select count(*) from user_settings where user_id = ?", id)).isZero();
		assertThat(this.storage.has(key)).isFalse();
		assertThat(this.storage.has(abandoned)).isFalse();
	}

	@Test
	void 사용자_행은_남기고_익명화한다() throws Exception {
		Who me = login();
		call(me, delete("/api/me")).andExpect(status().isNoContent());

		Map<String, Object> row = this.jdbc.queryForMap("select provider_id, nickname, deleted_at from users where id = ?",
				UUID.fromString(me.id()));
		assertThat((String) row.get("provider_id")).startsWith("deleted:").doesNotContain(me.googleSub());
		assertThat(row.get("nickname")).isEqualTo("탈퇴한 사용자");
		assertThat(row.get("deleted_at")).isNotNull();
	}

	@Test
	void 커뮤니티는_글과_댓글을_비우고_공감과_차단을_지우고_신고는_남긴다() throws Exception {
		Who me = login();
		Who other = login();
		String myPost = share(me, dream(me));
		String otherPost = share(other, dream(other));
		String myComment = comment(me, otherPost, null);
		String otherReply = comment(other, otherPost, myComment);
		String myLone = comment(me, otherPost, null);
		call(me, put("/api/community/posts/" + otherPost + "/like"), "{\"liked\":true}").andExpect(status().isOk());
		call(me, put("/api/community/blocks/" + other.id())).andExpect(status().isNoContent());
		call(other, put("/api/community/blocks/" + me.id())).andExpect(status().isNoContent());
		call(me, post("/api/community/reports"), "{\"type\":\"post\",\"id\":\"%s\",\"reason\":\"spam\"}".formatted(otherPost))
			.andExpect(status().isNoContent());

		call(me, delete("/api/me")).andExpect(status().isNoContent());

		// 내 글 — 지운 것이고 꿈 내용은 남지 않는다
		Map<String, Object> post = this.jdbc.queryForMap("select title, dream_text, body, deleted_at from posts where id = ?",
				UUID.fromString(myPost));
		assertThat(post.get("deleted_at")).isNotNull();
		assertThat(post.get("title")).isNull();
		assertThat(post.get("dream_text")).isEqualTo("");
		assertThat(post.get("body")).isEqualTo("");
		this.mockMvc.perform(get("/api/community/posts/" + myPost)).andExpect(status().isNotFound());

		// 남의 글 — 답글이 달린 내 댓글은 자리만, 답글 없는 내 댓글은 사라지고, 내 공감은 빠진다
		String d = this.mockMvc.perform(get("/api/community/posts/" + otherPost)).andReturn().getResponse().getContentAsString();
		assertThat(JsonPath.<List<String>>read(d, "$.comments[*].id")).containsExactly(myComment, otherReply).doesNotContain(myLone);
		assertThat(JsonPath.<Boolean>read(d, "$.comments[0].deleted")).isTrue();
		assertThat(JsonPath.<String>read(d, "$.comments[0].body")).isEmpty();
		assertThat(JsonPath.<Integer>read(d, "$.likeCount")).isZero();
		assertThat(JsonPath.<Integer>read(d, "$.commentCount")).isEqualTo(1);
		assertThat(count("select count(*) from comments where author_id = ? and body <> ''", UUID.fromString(me.id()))).isZero();

		UUID id = UUID.fromString(me.id());
		assertThat(count("select count(*) from user_blocks where blocker_id = ? or blocked_id = ?", id, id)).isZero();
		assertThat(count("select count(*) from reports where reporter_id = ?", id)).isEqualTo(1);
		// 탈퇴한 사람은 없는 사람이다
		this.mockMvc.perform(get("/api/users/" + me.id() + "/profile")).andExpect(status().isNotFound());
	}

	// ---------------------------------------------------------------- 다시 로그인 (모바일 요청)

	/**
	 * 폰은 삭제 뒤 "올렸음" 표시를 지운다. 같은 구글 계정으로 다시 로그인하면 예전 꿈 id 그대로 처음부터 다시 올린다.
	 * 서버에서 꿈을 실제로 지웠으니 그 id 는 비어 있고, 새 계정의 기록으로 들어가야 한다 — 남아 있었다면 not_owned 로 거절된다.
	 */
	@Test
	void 지운_뒤_같은_구글_계정으로_로그인하면_새_계정이고_같은_꿈_id로_다시_올린다() throws Exception {
		String sub = "google-sub-" + UUID.randomUUID();
		Who before = login(sub);
		String dreamId = dream(before);
		call(before, delete("/api/me")).andExpect(status().isNoContent());

		Who after = login(sub);
		assertThat(after.id()).isNotEqualTo(before.id());

		String r = call(after, post("/api/sync/dreams"), pushBody(dreamId, "폰에 남아 있던 꿈")).andExpect(status().isOk())
			.andReturn().getResponse().getContentAsString();
		assertThat(JsonPath.<String>read(r, "$.results[0].status")).isEqualTo("saved");

		String pulled = call(after, get("/api/sync/dreams")).andReturn().getResponse().getContentAsString();
		assertThat(JsonPath.<List<String>>read(pulled, "$.dreams[*].id")).containsExactly(dreamId);
		assertThat(JsonPath.<List<String>>read(pulled, "$.dreams[*].text")).containsExactly("폰에 남아 있던 꿈");
		assertThat(this.jdbc.queryForObject("select user_id from dreams where id = ?", UUID.class, dreamId))
			.isEqualTo(UUID.fromString(after.id()));
		// 새 계정의 닉네임은 새로 붙는다
		String meNow = call(after, get("/api/me")).andReturn().getResponse().getContentAsString();
		assertThat(JsonPath.<String>read(meNow, "$.nickname")).isNotEqualTo("탈퇴한 사용자");
	}

	// ---------------------------------------------------------------- 실패 · 경합

	@Test
	void S3에서_못_지우면_503이고_아무것도_지우지_않는다() throws Exception {
		Who me = login();
		String dreamId = dream(me);
		String key = upload(me, dreamId);
		this.storage.failDeletes(true);

		assertThat(code(call(me, delete("/api/me")).andExpect(status().isServiceUnavailable()))).isEqualTo("deletion_failed");

		assertThat(count("select count(*) from dreams where id = ?", dreamId)).isEqualTo(1);
		assertThat(this.storage.has(key)).isTrue();
		call(me, get("/api/me")).andExpect(status().isOk());

		// 다시 누르면 처음부터 다시 한다
		this.storage.failDeletes(false);
		call(me, delete("/api/me")).andExpect(status().isNoContent());
		assertThat(count("select count(*) from dreams where id = ?", dreamId)).isZero();
	}

	/**
	 * 토큰 검사를 지난 push 가 삭제와 겹친 경우(문서 065 02장). 삭제가 사용자 행을 잡고 있는 동안 들어온 push 는
	 * 기다렸다가 커밋된 삭제를 보고 401 로 끝나야 한다 — 다시 보지 않으면 삭제 뒤에 커밋해 꿈을 되살린다.
	 */
	@Test
	void 삭제가_사용자_행을_잡은_동안_들어온_push는_기다렸다가_401이다() throws Exception {
		Who me = login();
		UUID id = UUID.fromString(me.id());
		CountDownLatch locked = new CountDownLatch(1);
		CountDownLatch release = new CountDownLatch(1);

		// 삭제 트랜잭션을 흉내 낸다 — 행을 잡고, push 가 들어온 뒤에 지운 것으로 커밋한다
		CompletableFuture<Void> deleting = CompletableFuture.runAsync(() -> this.transactions.executeWithoutResult(s -> {
			this.jdbc.queryForList("select id from users where id = ? for update", id);
			locked.countDown();
			try {
				release.await(10, TimeUnit.SECONDS);
			}
			catch (InterruptedException ex) {
				Thread.currentThread().interrupt();
			}
			this.jdbc.update("update users set deleted_at = now() where id = ?", id);
		}));
		assertThat(locked.await(10, TimeUnit.SECONDS)).isTrue();

		// 토큰 검사는 잠그지 않으므로 지나간다(아직 커밋 전). push 는 사용자 행에서 기다린다
		CompletableFuture<MvcResult> pushing = CompletableFuture.supplyAsync(() -> {
			try {
				return call(me, post("/api/sync/dreams"), pushBody("raced-" + UUID.randomUUID(), "겹친 꿈")).andReturn();
			}
			catch (Exception ex) {
				throw new IllegalStateException(ex);
			}
		});
		Thread.sleep(700);
		assertThat(pushing).isNotDone();

		release.countDown();
		deleting.get(10, TimeUnit.SECONDS);
		MvcResult result = pushing.get(10, TimeUnit.SECONDS);

		assertThat(result.getResponse().getStatus()).isEqualTo(401);
		assertThat(JsonPath.<String>read(result.getResponse().getContentAsString(), "$.code")).isEqualTo("account_deleted");
		assertThat(count("select count(*) from dreams where user_id = ?", id)).isZero();
	}

	@Test
	void 삭제_뒤에_올라온_녹음은_쓸어_내기가_지우고_남의_것은_건드리지_않는다() throws Exception {
		Who me = login();
		Who other = login();
		call(me, delete("/api/me")).andExpect(status().isNoContent());

		// 삭제 전에 받은 URL 로 삭제 뒤에 PUT 한 것
		String late = "audio/" + me.id() + "/d-late/" + UUID.randomUUID() + ".wav";
		String alive = "audio/" + other.id() + "/d-alive/" + UUID.randomUUID() + ".wav";
		this.storage.put(late, 10);
		this.storage.put(alive, 10);

		this.deletion.sweepAudio();

		assertThat(this.storage.has(late)).isFalse();
		assertThat(this.storage.has(alive)).isTrue();
	}

	// ---------------------------------------------------------------- 닉네임 예약

	@Test
	void 탈퇴한_사용자라는_닉네임은_띄어_써도_못_쓴다() throws Exception {
		Who me = login();
		for (String reserved : List.of("탈퇴한 사용자", "탈퇴한  사용자", "탈퇴한사용자", " 탈퇴한 사용자 ")) {
			assertThat(code(call(me, patch("/api/me"), "{\"nickname\":\"" + reserved + "\"}").andExpect(status().isBadRequest())))
				.isEqualTo("nickname_invalid");
		}
		call(me, patch("/api/me"), "{\"nickname\":\"탈퇴 직전\"}").andExpect(status().isOk());
	}
}
