package com.kkume.server.audio;

import java.time.Instant;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.List;
import java.util.UUID;
import java.util.function.Supplier;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.BDDMockito.given;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.support.DefaultListableBeanFactory;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.transaction.support.TransactionTemplate;

import com.kkume.server.TestcontainersConfiguration;
import com.kkume.server.auth.GoogleTokenVerifier;
import com.kkume.server.auth.SocialIdentity;
import com.kkume.server.dream.Dream;
import com.kkume.server.dream.DreamRepository;
import com.kkume.server.job.JobRepository;
import com.kkume.server.job.JobStatus;
import com.kkume.server.job.JobType;
import com.kkume.server.job.SttException;
import com.kkume.server.job.SttProperties;
import com.kkume.server.job.SttTranscriber;
import com.kkume.server.job.SttWorker;
import com.kkume.server.user.Provider;

/**
 * 오디오 업로드 → 변환 작업 → 상태 조회를 로그인부터 끝까지 돌린다. 계약은 문서 039.
 *
 * <p>여기서 가장 중요한 것은 <b>서버가 기록의 {@code text}와 {@code clientUpdatedAt}을 건드리지 않는가</b>다.
 * 건드리면 변환 도중 사용자가 고친 글과 부딪혀 둘 중 하나가 사라진다(039 C1).
 *
 * <p>일꾼은 자동으로 돌지 않게 끄고({@code worker-enabled=false}) {@link SttWorker#runOnce()}를 직접 부른다.
 * 실패 뒤 기다리는 시간도 0으로 둬서 곧바로 다시 잡히게 한다.
 */
@Import({ TestcontainersConfiguration.class, AudioApiTest.Fakes.class })
@SpringBootTest(properties = { "kkume.stt.worker-enabled=false", "kkume.stt.backoff=0s" })
@AutoConfigureMockMvc
class AudioApiTest {

	@TestConfiguration(proxyBeanMethods = false)
	static class Fakes {

		@Bean
		@Primary
		FakeAudioStorage fakeAudioStorage() {
			return new FakeAudioStorage();
		}

		@Bean
		FakeTranscriber fakeTranscriber() {
			return new FakeTranscriber();
		}
	}

	/** 다음 호출에 무엇을 돌려줄지 줄로 세워 둔다. 비어 있으면 호출 자체가 테스트 실수다 */
	static class FakeTranscriber implements SttTranscriber {

		private final Deque<Supplier<String>> next = new ArrayDeque<>();

		void willReturn(String text) {
			this.next.add(() -> text);
		}

		void willFail(String code, boolean retryable) {
			this.next.add(() -> {
				throw new SttException(code, retryable, "가짜 실패");
			});
		}

		@Override
		public String transcribe(String audioLocation) {
			Supplier<String> s = this.next.poll();
			if (s == null) {
				throw new AssertionError("변환기가 예상보다 많이 불렸다: " + audioLocation);
			}
			return s.get();
		}
	}

	@Autowired
	private MockMvc mockMvc;

	@Autowired
	private DreamRepository dreams;

	@Autowired
	private JobRepository jobs;

	@Autowired
	private FakeAudioStorage storage;

	@Autowired
	private FakeTranscriber transcriber;

	@Autowired
	private SttWorker worker;

	@Autowired
	private TransactionTemplate transactions;

	@Autowired
	private SttProperties sttProperties;

	@MockitoBean
	private GoogleTokenVerifier googleVerifier;

	private String token;

	@BeforeEach
	void login() throws Exception {
		this.token = newAccount();
		// 다른 테스트가 줄에 남긴 작업을 비운다. 일꾼은 사용자 구분 없이 가장 오래된 것부터 잡는다
		this.transactions.executeWithoutResult(s -> this.jobs.findAll().forEach(j -> {
			if (j.getStatus() == JobStatus.QUEUED) {
				this.jobs.delete(j);
			}
		}));
	}

	private String newAccount() throws Exception {
		given(this.googleVerifier.verify(anyString()))
			.willReturn(new SocialIdentity(Provider.GOOGLE, "google-sub-" + UUID.randomUUID()));
		String response = this.mockMvc
			.perform(post("/api/auth/google").contentType(MediaType.APPLICATION_JSON).content("{\"idToken\":\"x\"}"))
			.andExpect(status().isOk())
			.andReturn().getResponse().getContentAsString();
		return JsonPath.read(response, "$.accessToken");
	}

	private static String newId() {
		return Long.toString(System.currentTimeMillis(), 36) + "-" + UUID.randomUUID().toString().substring(0, 6);
	}

	/** 동기화로 기록 행을 올린다(흐름 ①). durationMs 가 없으면 끝나지 않은 녹음이다 */
	private String pushDream(String token, Integer durationMs, Instant deletedAt) throws Exception {
		String id = newId();
		String body = """
				{"dreams":[{"id":"%s","recordedAt":"2026-09-17T01:00:00.000Z","title":"고래 꿈","text":"사용자가 적은 글",
				"durationMs":%s,"deletedAt":%s,"updatedAt":"2026-09-17T01:00:05.123Z"}]}"""
			.formatted(id, durationMs, deletedAt == null ? "null" : "\"" + deletedAt + "\"");
		this.mockMvc.perform(post("/api/sync/dreams").header("Authorization", "Bearer " + token)
			.contentType(MediaType.APPLICATION_JSON).content(body))
			.andExpect(status().isOk());
		return id;
	}

	private ResultActions upload(String token, String id) throws Exception {
		return this.mockMvc.perform(post("/api/dreams/" + id + "/audio/upload").header("Authorization", "Bearer " + token));
	}

	private ResultActions complete(String token, String id, String key) throws Exception {
		return this.mockMvc.perform(post("/api/dreams/" + id + "/audio/complete").header("Authorization", "Bearer " + token)
			.contentType(MediaType.APPLICATION_JSON).content("{\"key\":\"" + key + "\"}"));
	}

	private ResultActions stt(String token, String id) throws Exception {
		return this.mockMvc.perform(get("/api/dreams/" + id + "/stt").header("Authorization", "Bearer " + token));
	}

	private ResultActions retry(String token, String id) throws Exception {
		return this.mockMvc.perform(post("/api/dreams/" + id + "/stt/retry").header("Authorization", "Bearer " + token));
	}

	private static String json(ResultActions r) throws Exception {
		return r.andReturn().getResponse().getContentAsString();
	}

	/** ② 받고 ③ 올리고 ④ 알린다. 올린 키를 돌려준다 */
	private String uploadAndComplete(String id) throws Exception {
		String key = JsonPath.read(json(upload(this.token, id).andExpect(status().isOk())), "$.key");
		this.storage.put(key, 1_000_000);
		complete(this.token, id, key).andExpect(status().isOk());
		return key;
	}

	// ---------------------------------------------------------------- 흐름

	@Test
	void 업로드_자리는_PUT과_헤더와_이_기록의_키를_준다() throws Exception {
		String id = pushDream(this.token, 60_000, null);
		String r = json(upload(this.token, id).andExpect(status().isOk()));

		assertThat(JsonPath.<String>read(r, "$.method")).isEqualTo("PUT");
		assertThat(JsonPath.<String>read(r, "$.headers['Content-Type']")).isEqualTo("audio/mp4");
		assertThat(JsonPath.<String>read(r, "$.key")).startsWith("audio/").contains("/" + id + "/").endsWith(".m4a");
		assertThat(JsonPath.<String>read(r, "$.uploadUrl")).isNotBlank();
		assertThat(JsonPath.<String>read(r, "$.expiresAt")).isNotBlank();
	}

	@Test
	void 다_올렸다고_알리면_audioUrl이_채워지고_글과_기기_시각은_그대로다() throws Exception {
		String id = pushDream(this.token, 60_000, null);
		Dream before = this.dreams.findById(id).orElseThrow();

		String key = JsonPath.read(json(upload(this.token, id)), "$.key");
		this.storage.put(key, 1_000_000);
		String r = json(complete(this.token, id, key).andExpect(status().isOk()));
		assertThat(JsonPath.<String>read(r, "$.sttStatus")).isEqualTo("pending");

		Dream after = this.dreams.findById(id).orElseThrow();
		assertThat(after.getAudioUrl()).isEqualTo("s3://fake-bucket/" + key);
		// 서버가 쓰는 것은 audio_url · stt_status · updated_at 뿐이다
		assertThat(after.getText()).isEqualTo(before.getText());
		assertThat(after.getClientUpdatedAt()).isEqualTo(before.getClientUpdatedAt());
		// updated_at 이 올라가야 받기에 다시 내려가 앱이 audioUrl 을 안다
		assertThat(after.getUpdatedAt()).isAfter(before.getUpdatedAt());

		String pulled = json(this.mockMvc.perform(get("/api/sync/dreams").header("Authorization", "Bearer " + this.token)));
		assertThat(JsonPath.<List<String>>read(pulled, "$.dreams[?(@.id=='" + id + "')].audioUrl")).containsExactly(after.getAudioUrl());

		String s = json(stt(this.token, id).andExpect(status().isOk()));
		assertThat(JsonPath.<String>read(s, "$.status")).isEqualTo("pending");
		assertThat(JsonPath.<Integer>read(s, "$.attempts")).isZero();
		assertThat(JsonPath.<Object>read(s, "$.text")).isNull();
	}

	@Test
	void 같은_complete를_두_번_보내도_작업은_하나다() throws Exception {
		String id = pushDream(this.token, 60_000, null);
		String key = JsonPath.read(json(upload(this.token, id)), "$.key");
		this.storage.put(key, 1_000_000);

		complete(this.token, id, key).andExpect(status().isOk());
		// 응답이 유실돼 앱이 다시 보낸 상황
		String again = json(complete(this.token, id, key).andExpect(status().isOk()));
		assertThat(JsonPath.<String>read(again, "$.sttStatus")).isEqualTo("pending");
		assertThat(this.jobs.findAll().stream().filter(j -> j.getDreamId().equals(id)).count()).isEqualTo(1);
	}

	@Test
	void 변환이_끝나면_원문은_stt에만_있고_기록의_글은_그대로다() throws Exception {
		String id = pushDream(this.token, 60_000, null);
		uploadAndComplete(id);
		Dream beforeRun = this.dreams.findById(id).orElseThrow();

		this.transcriber.willReturn("고래가 하늘을 날았다");
		assertThat(this.worker.runOnce()).isTrue();

		String s = json(stt(this.token, id).andExpect(status().isOk()));
		assertThat(JsonPath.<String>read(s, "$.status")).isEqualTo("done");
		assertThat(JsonPath.<String>read(s, "$.text")).isEqualTo("고래가 하늘을 날았다");
		assertThat(JsonPath.<Integer>read(s, "$.attempts")).isEqualTo(1);

		Dream after = this.dreams.findById(id).orElseThrow();
		// 합치기는 앱이 한다. 서버가 text 를 쓰면 사용자 수정과 부딪힌다(039 C1)
		assertThat(after.getText()).isEqualTo("사용자가 적은 글");
		assertThat(after.getClientUpdatedAt()).isEqualTo(beforeRun.getClientUpdatedAt());
		assertThat(after.getUpdatedAt()).isAfter(beforeRun.getUpdatedAt());

		assertThat(this.worker.runOnce()).isFalse();
	}

	@Test
	void 변환_도중_사용자가_고친_글은_그대로_올라간다() throws Exception {
		String id = pushDream(this.token, 60_000, null);
		uploadAndComplete(id);
		this.transcriber.willReturn("변환 원문");
		this.worker.runOnce();

		// 변환이 끝난 뒤 늦게 도착한, 기기에서 더 나중에 고친 글
		String body = """
				{"dreams":[{"id":"%s","recordedAt":"2026-09-17T01:00:00.000Z","title":"고래 꿈","text":"낮에 고친 글",
				"durationMs":60000,"updatedAt":"2026-09-17T01:10:00.000Z"}]}""".formatted(id);
		String r = json(this.mockMvc.perform(post("/api/sync/dreams").header("Authorization", "Bearer " + this.token)
			.contentType(MediaType.APPLICATION_JSON).content(body)));

		// 서버가 client_updated_at 을 올려 두지 않았으므로 skipped 가 되지 않는다
		assertThat(JsonPath.<String>read(r, "$.results[0].status")).isEqualTo("saved");
		assertThat(this.dreams.findById(id).orElseThrow().getText()).isEqualTo("낮에 고친 글");
		assertThat(JsonPath.<String>read(json(stt(this.token, id)), "$.text")).isEqualTo("변환 원문");
	}

	@Test
	void 다시_해볼_만한_실패는_세_번까지_하고_failed가_된다() throws Exception {
		String id = pushDream(this.token, 60_000, null);
		uploadAndComplete(id);
		int max = this.sttProperties.maxAttempts();

		for (int i = 1; i < max; i++) {
			this.transcriber.willFail("provider_error", true);
			this.worker.runOnce();
			// 자동 재시도 중에는 앱에 pending 이고 오류를 보여 주지 않는다
			String s = json(stt(this.token, id));
			assertThat(JsonPath.<String>read(s, "$.status")).isEqualTo("pending");
			assertThat(JsonPath.<Object>read(s, "$.error")).isNull();
		}
		this.transcriber.willFail("provider_error", true);
		this.worker.runOnce();

		String s = json(stt(this.token, id));
		assertThat(JsonPath.<String>read(s, "$.status")).isEqualTo("failed");
		assertThat(JsonPath.<String>read(s, "$.error")).isEqualTo("provider_error");
		assertThat(JsonPath.<Integer>read(s, "$.attempts")).isEqualTo(max);
	}

	@Test
	void 다시_해도_소용없는_실패는_곧바로_failed다() throws Exception {
		String id = pushDream(this.token, 60_000, null);
		uploadAndComplete(id);

		this.transcriber.willFail("no_speech", false);
		this.worker.runOnce();

		String s = json(stt(this.token, id));
		assertThat(JsonPath.<String>read(s, "$.status")).isEqualTo("failed");
		assertThat(JsonPath.<String>read(s, "$.error")).isEqualTo("no_speech");
		assertThat(JsonPath.<Integer>read(s, "$.attempts")).isEqualTo(1);
	}

	@Test
	void 실패한_변환을_다시_하면_처음부터_센다() throws Exception {
		String id = pushDream(this.token, 60_000, null);
		uploadAndComplete(id);
		this.transcriber.willFail("no_speech", false);
		this.worker.runOnce();

		String r = json(retry(this.token, id).andExpect(status().isOk()));
		assertThat(JsonPath.<String>read(r, "$.sttStatus")).isEqualTo("pending");
		assertThat(JsonPath.<Integer>read(json(stt(this.token, id)), "$.attempts")).isZero();

		this.transcriber.willReturn("두 번째에 됐다");
		this.worker.runOnce();
		assertThat(JsonPath.<String>read(json(stt(this.token, id)), "$.status")).isEqualTo("done");
	}

	@Test
	void 대기_중에_다시_하기를_눌러도_아무_일도_없다() throws Exception {
		String id = pushDream(this.token, 60_000, null);
		uploadAndComplete(id);

		String r = json(retry(this.token, id).andExpect(status().isOk()));
		assertThat(JsonPath.<String>read(r, "$.sttStatus")).isEqualTo("pending");
	}

	@Test
	void 변환기가_없으면_작업을_받아_두기만_한다() throws Exception {
		String id = pushDream(this.token, 60_000, null);
		uploadAndComplete(id);

		// 변환 서비스를 아직 고르지 않은 운영 서버와 같은 상태
		SttWorker noTranscriber = new SttWorker(this.jobs, this.dreams, this.transactions,
				new DefaultListableBeanFactory().getBeanProvider(SttTranscriber.class), this.sttProperties);

		assertThat(noTranscriber.runOnce()).isFalse();
		assertThat(this.jobs.findByDreamIdAndType(id, JobType.STT).orElseThrow().getStatus()).isEqualTo(JobStatus.QUEUED);
		assertThat(JsonPath.<String>read(json(stt(this.token, id)), "$.status")).isEqualTo("pending");
	}

	// ---------------------------------------------------------------- 오류

	@Test
	void 토큰이_없으면_401이다() throws Exception {
		this.mockMvc.perform(post("/api/dreams/x/audio/upload")).andExpect(status().isUnauthorized());
		this.mockMvc.perform(get("/api/dreams/x/stt")).andExpect(status().isUnauthorized());
	}

	@Test
	void 동기화_전이거나_남의_기록이면_없는_것으로_답한다() throws Exception {
		ResultActions notSynced = upload(this.token, "not-synced-yet").andExpect(status().isNotFound());
		assertThat(JsonPath.<String>read(json(notSynced), "$.code")).isEqualTo("dream_not_found");

		String mine = pushDream(this.token, 60_000, null);
		String key = uploadAndComplete(mine);

		String stranger = newAccount();
		for (ResultActions r : List.of(upload(stranger, mine), complete(stranger, mine, key), stt(stranger, mine),
				retry(stranger, mine))) {
			r.andExpect(status().isNotFound());
			assertThat(JsonPath.<String>read(json(r), "$.code")).isEqualTo("dream_not_found");
		}
	}

	@Test
	void 끝나지_않은_녹음은_받지_않는다() throws Exception {
		String id = pushDream(this.token, null, null);
		ResultActions r = upload(this.token, id).andExpect(status().isConflict());
		assertThat(JsonPath.<String>read(json(r), "$.code")).isEqualTo("recording_unfinished");
	}

	@Test
	void 지운_기록은_받지_않는다() throws Exception {
		String id = pushDream(this.token, 60_000, Instant.parse("2026-09-17T02:00:00Z"));
		ResultActions r = upload(this.token, id).andExpect(status().isConflict());
		assertThat(JsonPath.<String>read(json(r), "$.code")).isEqualTo("dream_deleted");
	}

	@Test
	void 이미_올라간_기록에_다시_자리를_달라면_거절한다() throws Exception {
		String id = pushDream(this.token, 60_000, null);
		uploadAndComplete(id);
		ResultActions r = upload(this.token, id).andExpect(status().isConflict());
		assertThat(JsonPath.<String>read(json(r), "$.code")).isEqualTo("audio_exists");
	}

	@Test
	void 이미_끝난_기록에_다른_파일로_complete하면_거절한다() throws Exception {
		String id = pushDream(this.token, 60_000, null);
		String first = JsonPath.read(json(upload(this.token, id)), "$.key");
		String second = JsonPath.read(json(upload(this.token, id)), "$.key");
		this.storage.put(first, 1_000);
		this.storage.put(second, 1_000);
		complete(this.token, id, first).andExpect(status().isOk());

		ResultActions r = complete(this.token, id, second).andExpect(status().isConflict());
		assertThat(JsonPath.<String>read(json(r), "$.code")).isEqualTo("audio_exists");
	}

	@Test
	void 다른_기록의_키로는_complete할_수_없다() throws Exception {
		String a = pushDream(this.token, 60_000, null);
		String b = pushDream(this.token, 60_000, null);
		String keyOfA = JsonPath.read(json(upload(this.token, a)), "$.key");
		this.storage.put(keyOfA, 1_000);

		for (String bad : List.of(keyOfA, "audio/../other.m4a", "")) {
			ResultActions r = complete(this.token, b, bad).andExpect(status().isBadRequest());
			assertThat(JsonPath.<String>read(json(r), "$.code")).isEqualTo("key_mismatch");
		}
		assertThat(this.dreams.findById(b).orElseThrow().getAudioUrl()).isNull();
	}

	@Test
	void 올리지_않고_complete하면_다시_올리라고_한다() throws Exception {
		String id = pushDream(this.token, 60_000, null);
		String key = JsonPath.read(json(upload(this.token, id)), "$.key");

		ResultActions r = complete(this.token, id, key).andExpect(status().isUnprocessableContent());
		assertThat(JsonPath.<String>read(json(r), "$.code")).isEqualTo("upload_missing");
		assertThat(this.dreams.findById(id).orElseThrow().getAudioUrl()).isNull();
	}

	@Test
	void 너무_큰_파일은_지우고_거절한다() throws Exception {
		String id = pushDream(this.token, 60_000, null);
		String key = JsonPath.read(json(upload(this.token, id)), "$.key");
		this.storage.put(key, 26_214_401);

		ResultActions r = complete(this.token, id, key).andExpect(status().isContentTooLarge());
		assertThat(JsonPath.<String>read(json(r), "$.code")).isEqualTo("audio_too_large");
		assertThat(this.storage.wasDeleted(key)).isTrue();
		assertThat(this.dreams.findById(id).orElseThrow().getAudioUrl()).isNull();
	}

	@Test
	void 오디오가_없는_기록의_변환_상태는_없다() throws Exception {
		String id = pushDream(this.token, 60_000, null);
		for (ResultActions r : List.of(stt(this.token, id), retry(this.token, id))) {
			r.andExpect(status().isNotFound());
			assertThat(JsonPath.<String>read(json(r), "$.code")).isEqualTo("no_audio");
		}
	}

	@Test
	void 끝난_변환은_다시_하지_않는다() throws Exception {
		String id = pushDream(this.token, 60_000, null);
		uploadAndComplete(id);
		this.transcriber.willReturn("끝");
		this.worker.runOnce();

		ResultActions r = retry(this.token, id).andExpect(status().isConflict());
		assertThat(JsonPath.<String>read(json(r), "$.code")).isEqualTo("already_done");
	}
}
