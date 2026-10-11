package com.kkume.server.comic;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.BDDMockito.given;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;

import org.junit.jupiter.api.AfterEach;
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
import com.kkume.server.auth.GoogleTokenVerifier;
import com.kkume.server.auth.SocialIdentity;
import com.kkume.server.user.AccountDeletionService;
import com.kkume.server.user.Provider;

/**
 * 꿈 만화를 만들기 부탁부터 그림까지 돌린다. 계약은 문서 081(01 · 02 · 03 · 04장), 모델 · 상한은 06장.
 *
 * <p>모델은 가짜({@link FakeComicAi})고, 일꾼은 테스트가 직접 {@link ComicWorker#runOnce()}로 돌린다.
 * 다른 테스트가 줄에 남긴 만화가 없게 매번 줄을 비운다.
 */
@Import({ TestcontainersConfiguration.class, ComicApiTest.Fakes.class })
@SpringBootTest(properties = { "kkume.stt.worker-enabled=false", "kkume.comic.worker-enabled=false",
		"kkume.comic.bucket=test-bucket", "kkume.comic.service-daily-limit=1000" })
@AutoConfigureMockMvc
class ComicApiTest {

	@TestConfiguration(proxyBeanMethods = false)
	static class Fakes {

		@Bean
		@Primary
		FakeComicStorage fakeComicStorage() {
			return new FakeComicStorage();
		}

		@Bean
		@Primary
		FakeComicAi fakeComicAi() {
			return new FakeComicAi();
		}
	}

	@Autowired
	private MockMvc mockMvc;

	@Autowired
	private JdbcTemplate jdbc;

	@Autowired
	private ComicWorker worker;

	@Autowired
	private FakeComicAi ai;

	@Autowired
	private FakeComicStorage storage;

	@Autowired
	private AccountDeletionService deletion;

	@MockitoBean
	private GoogleTokenVerifier googleVerifier;

	private record Who(String id, String token) {
	}

	private Who me;

	@BeforeEach
	void setUp() throws Exception {
		drain();
		this.ai.reset();
		this.me = login();
	}

	@AfterEach
	void tearDown() {
		drain();
		this.ai.reset();
		// 서비스 전체를 막는 행(무료 한도 초과)이 다음 테스트에 남지 않게
		this.jdbc.update("update comics set fail_code = 'budget_test' where fail_code = 'budget'");
	}

	// ---------------------------------------------------------------- 도우미

	private void drain() {
		while (this.worker.runOnce()) {
			// 줄이 빌 때까지
		}
	}

	private Who login() throws Exception {
		given(this.googleVerifier.verify(anyString()))
			.willReturn(new SocialIdentity(Provider.GOOGLE, "google-sub-" + UUID.randomUUID()));
		String r = this.mockMvc
			.perform(post("/api/auth/google").contentType(MediaType.APPLICATION_JSON)
				.content("{\"idToken\":\"x\",\"consentVersion\":\"2026-10-07\"}"))
			.andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
		return new Who(JsonPath.read(r, "$.user.id"), JsonPath.read(r, "$.accessToken"));
	}

	private ResultActions call(Who who, MockHttpServletRequestBuilder req) throws Exception {
		return this.mockMvc.perform(who == null ? req : req.header("Authorization", "Bearer " + who.token()));
	}

	private ResultActions create(Who who, String dreamId, String text, String style) throws Exception {
		return call(who, post("/api/comics").contentType(MediaType.APPLICATION_JSON).content("""
				{"dreamId":"%s","title":"복도 꿈","dreamText":"%s","style":"%s"}""".formatted(dreamId, text, style)));
	}

	private String createId(Who who, String dreamId) throws Exception {
		return JsonPath.read(json(create(who, dreamId, "학교 복도가 끝없이 길어졌다.", "soft").andExpect(status().isAccepted())),
				"$.id");
	}

	private static String json(ResultActions r) throws Exception {
		return r.andReturn().getResponse().getContentAsString();
	}

	private String read(Who who, String comicId) throws Exception {
		return json(call(who, get("/api/comics/" + comicId)).andExpect(status().isOk()));
	}

	private static String dreamId() {
		return "d-" + UUID.randomUUID().toString().substring(0, 12);
	}

	// ---------------------------------------------------------------- 01 · 02 만들기 · 읽기

	@Test
	void 만들면_queued_로_받고_일꾼이_대본과_그림을_만들어_done_이_된다() throws Exception {
		String dream = dreamId();
		create(this.me, dream, "학교 복도가 끝없이 길어졌다.", "soft")
			.andExpect(status().isAccepted())
			.andExpect(jsonPath("$.status").value("queued"))
			.andExpect(jsonPath("$.dreamId").value(dream))
			.andExpect(jsonPath("$.style").value("soft"))
			.andExpect(jsonPath("$.layout").doesNotExist())
			.andExpect(jsonPath("$.imageUrls").isEmpty())
			.andExpect(jsonPath("$.panels").isEmpty())
			.andExpect(jsonPath("$.finishedAt").doesNotExist());

		drain();

		String id = JsonPath.read(json(call(this.me, get("/api/comics").param("dreamId", dream))), "$.items[0].id");
		String r = read(this.me, id);
		assertThat((String) JsonPath.read(r, "$.status")).isEqualTo("done");
		assertThat((String) JsonPath.read(r, "$.layout")).isEqualTo("grid2x2");
		List<String> urls = JsonPath.read(r, "$.imageUrls");
		assertThat(urls).singleElement().asString().contains("comics/" + this.me.id() + "/" + id + "/grid.jpg");
		List<Map<String, Object>> panels = JsonPath.read(r, "$.panels");
		assertThat(panels).hasSize(4);
		assertThat(panels.get(0)).containsEntry("caption", "복도를 걸었는데 길이 끝없이 늘어났다").containsEntry("dialogue", null);
		assertThat(panels.get(1)).containsEntry("dialogue", "바다다!");
		// 모델이 "null" 이라는 글자를 쓰면 없음으로 본다
		assertThat(panels.get(2)).containsEntry("dialogue", null);
		assertThat((String) JsonPath.read(r, "$.finishedAt")).isNotNull();
		assertThat((Object) JsonPath.read(r, "$.failMessage")).isNull();

		// 꿈 제목 · 본문만 모델에 간다. 그림 프롬프트에는 글자를 넣지 말라는 말과 그림체가 들어간다
		assertThat(this.ai.lastUserMessage).isEqualTo("복도 꿈\n\n학교 복도가 끝없이 길어졌다.");
		assertThat(this.ai.lastPrompt).contains("2x2 grid", "no text", "pastel watercolor",
				"a young adult with short black hair", "Top-left panel: A long school hallway");
		assertThat(this.storage.has("comics/" + this.me.id() + "/" + id + "/grid.jpg")).isTrue();

		// 끝난 만화에는 꿈 내용 · 장면 묘사가 남지 않는다
		Map<String, Object> row = this.jdbc.queryForMap("select title, dream_text, scenes from comics where id = ?::uuid", id);
		assertThat(row.values()).containsOnlyNulls();
	}

	@Test
	void 호출마다_원가를_뉴런과_환산_금액으로_남긴다() throws Exception {
		String id = createId(this.me, dreamId());
		drain();

		List<Map<String, Object>> costs = this.jdbc.queryForList(
				"select step, model, ok, input_tokens, output_tokens, images, neurons, usd from comic_costs where comic_id = ?::uuid order by id",
				id);
		assertThat(costs).hasSize(2);
		assertThat(costs.get(0)).containsEntry("step", "script").containsEntry("model", "@cf/openai/gpt-oss-120b")
			.containsEntry("ok", true).containsEntry("input_tokens", 600).containsEntry("output_tokens", 900);
		// 600 × $0.35/M + 900 × $0.75/M = $0.000885 = 80.455 뉴런
		assertThat((BigDecimal) costs.get(0).get("usd")).isEqualByComparingTo("0.000885");
		assertThat((BigDecimal) costs.get(0).get("neurons")).isEqualByComparingTo("80.455");
		// 1024² = 512² 네 칸 × $0.000287 = $0.001148 = 104.364 뉴런
		assertThat(costs.get(1)).containsEntry("step", "image").containsEntry("images", 1);
		assertThat((BigDecimal) costs.get(1).get("usd")).isEqualByComparingTo("0.001148");
		assertThat((BigDecimal) costs.get(1).get("neurons")).isEqualByComparingTo("104.364");
	}

	@Test
	void 잉크_그림체는_흑백_만화_프롬프트로_그린다() throws Exception {
		create(this.me, dreamId(), "시험 날 펜이 없었다.", "ink").andExpect(status().isAccepted());
		drain();
		assertThat(this.ai.lastPrompt).contains("black and white ink manga style").doesNotContain("watercolor");
	}

	@Test
	void 본문이_비었거나_너무_길거나_모르는_그림체면_400_invalid_comic_input() throws Exception {
		create(this.me, dreamId(), "   ", "soft").andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.code").value("invalid_comic_input"));
		create(this.me, dreamId(), "꿈", "watercolor").andExpect(status().isBadRequest());
		create(this.me, dreamId(), "가".repeat(20_001), "soft").andExpect(status().isBadRequest());
		create(this.me, "", "꿈", "soft").andExpect(status().isBadRequest());
		call(this.me, post("/api/comics").contentType(MediaType.APPLICATION_JSON).content("{}"))
			.andExpect(status().isBadRequest());
		// 20,000자는 받는다
		create(this.me, dreamId(), "가".repeat(20_000), "soft").andExpect(status().isAccepted());
	}

	@Test
	void 로그인하지_않으면_401() throws Exception {
		create(null, dreamId(), "꿈", "soft").andExpect(status().isUnauthorized());
		call(null, get("/api/comics").param("dreamId", "x")).andExpect(status().isUnauthorized());
	}

	@Test
	void 남의_만화는_없는_것과_같다() throws Exception {
		String id = createId(this.me, dreamId());
		Who other = login();
		call(other, get("/api/comics/" + id)).andExpect(status().isNotFound())
			.andExpect(jsonPath("$.code").value("comic_not_found"));
		call(other, delete("/api/comics/" + id)).andExpect(status().isNotFound());
		call(this.me, get("/api/comics/not-a-uuid")).andExpect(status().isNotFound());
		call(this.me, get("/api/comics/" + id)).andExpect(status().isOk());
	}

	@Test
	void 꿈별_목록은_내_것만_최신순이고_지운_것은_빠진다() throws Exception {
		String dream = dreamId();
		String first = createId(this.me, dream);
		drain();
		// 하루 1편이라 두 번째는 어제 만든 것으로 옮겨 둔다
		this.jdbc.update("update comics set created_at = created_at - interval '1 day' where id = ?::uuid", first);
		String second = createId(this.me, dream);
		drain();
		createId(login(), dream);

		String r = json(call(this.me, get("/api/comics").param("dreamId", dream)).andExpect(status().isOk()));
		assertThat((List<String>) JsonPath.read(r, "$.items[*].id")).containsExactly(second, first);

		call(this.me, delete("/api/comics/" + second)).andExpect(status().isNoContent());
		r = json(call(this.me, get("/api/comics").param("dreamId", dream)));
		assertThat((List<String>) JsonPath.read(r, "$.items[*].id")).containsExactly(first);
		call(this.me, get("/api/comics")).andExpect(status().isBadRequest());
	}

	// ---------------------------------------------------------------- 상한

	@Test
	void 만드는_중이면_409_comic_in_progress_와_그_만화_id() throws Exception {
		String id = createId(this.me, dreamId());
		create(this.me, dreamId(), "다른 꿈", "soft").andExpect(status().isConflict())
			.andExpect(jsonPath("$.code").value("comic_in_progress"))
			.andExpect(jsonPath("$.comicId").value(id));
	}

	@Test
	void 하루_한_편을_만들면_429_comic_daily_limit_와_KST_자정() throws Exception {
		createId(this.me, dreamId());
		drain();
		String r = json(create(this.me, dreamId(), "또 다른 꿈", "soft").andExpect(status().isTooManyRequests())
			.andExpect(jsonPath("$.code").value("comic_daily_limit")));
		String resetAt = JsonPath.read(r, "$.resetAt");
		// KST 자정 = 전날 15:00 UTC
		assertThat(resetAt).endsWith("T15:00:00Z");
	}

	@Test
	void 지운_만화도_하루_몫으로_센다() throws Exception {
		String id = createId(this.me, dreamId());
		drain();
		call(this.me, delete("/api/comics/" + id)).andExpect(status().isNoContent());
		create(this.me, dreamId(), "또 다른 꿈", "soft").andExpect(status().isTooManyRequests());
	}

	@Test
	void 서비스_전체_하루_몫을_넘으면_503_comic_budget_exhausted() throws Exception {
		long today = this.jdbc.queryForObject(
				"select count(*) from comics where created_at >= date_trunc('day', now() at time zone 'utc') at time zone 'utc'",
				Long.class);
		Who filler = login();
		this.jdbc.update("""
				insert into comics (id, user_id, dream_id, style, status, created_at, updated_at, finished_at)
				select gen_random_uuid(), ?::uuid, 'filler', 'soft', 'failed', now(), now(), now() from generate_series(1, ?)
				""", filler.id(), (int) Math.max(0, 1000 - today));
		try {
			create(this.me, dreamId(), "꿈", "soft").andExpect(status().isServiceUnavailable())
				.andExpect(jsonPath("$.code").value("comic_budget_exhausted"));
		}
		finally {
			this.jdbc.update("delete from comics where user_id = ?::uuid", filler.id());
		}
		create(this.me, dreamId(), "꿈", "soft").andExpect(status().isAccepted());
	}

	// ---------------------------------------------------------------- 실패 · 거절 (06장)

	@Test
	void NSFW_로_거절되면_refused_이고_하루_몫에서_빠진다() throws Exception {
		this.ai.nextImage(() -> {
			throw FakeComicAi.failure(ComicAiException.Kind.REFUSED, "cf_8007");
		});
		String id = createId(this.me, dreamId());
		drain();

		String r = read(this.me, id);
		assertThat((String) JsonPath.read(r, "$.status")).isEqualTo("refused");
		assertThat((String) JsonPath.read(r, "$.failMessage")).isEqualTo(ComicService.REFUSED_MESSAGE);
		assertThat((List<?>) JsonPath.read(r, "$.imageUrls")).isEmpty();
		assertThat(this.jdbc.queryForList("select ok, error from comic_costs where comic_id = ?::uuid and step = 'image'", id))
			.singleElement().isEqualTo(Map.of("ok", false, "error", "cf_8007"));
		// 끝난 만화에는 받은 꿈 본문이 남지 않는다(처리방침 PR #95 — done · failed · refused 모두)
		assertThat(this.jdbc.queryForMap("select title, dream_text, scenes from comics where id = ?::uuid", id).values())
			.containsOnlyNulls();

		createId(this.me, dreamId());
	}

	@Test
	void 모델이_실패하면_failed_이고_하루_몫에서_빠진다() throws Exception {
		this.ai.nextImage(() -> {
			throw FakeComicAi.failure(ComicAiException.Kind.FAILED, "http_502");
		});
		String id = createId(this.me, dreamId());
		drain();
		String r = read(this.me, id);
		assertThat((String) JsonPath.read(r, "$.status")).isEqualTo("failed");
		assertThat((String) JsonPath.read(r, "$.failMessage")).isEqualTo(ComicService.FAILED_MESSAGE);
		createId(this.me, dreamId());
	}

	@Test
	void 무료_한도를_넘으면_그_만화는_failed_이고_오늘_남은_요청은_503() throws Exception {
		this.ai.nextImage(() -> {
			throw FakeComicAi.failure(ComicAiException.Kind.BUDGET, "cf_3036");
		});
		String id = createId(this.me, dreamId());
		drain();
		String r = read(this.me, id);
		assertThat((String) JsonPath.read(r, "$.status")).isEqualTo("failed");
		assertThat((String) JsonPath.read(r, "$.failMessage")).isEqualTo(ComicService.BUDGET_MESSAGE);

		create(login(), dreamId(), "꿈", "soft").andExpect(status().isServiceUnavailable())
			.andExpect(jsonPath("$.code").value("comic_budget_exhausted"));
	}

	@Test
	void 대본이_계약에_맞지_않으면_한_번_다시_부른다() throws Exception {
		// 장면에 한글이 섞였다(082 꿈 2에서 실제로 본 것)
		this.ai.nextScript(() -> FakeComicAi.GOOD_SCRIPT.replace("A long school hallway stretches endlessly.", "끝없는 복도"));
		String id = createId(this.me, dreamId());
		drain();
		assertThat(this.ai.scriptCalls).hasValue(2);
		assertThat((String) JsonPath.read(read(this.me, id), "$.status")).isEqualTo("done");
		assertThat(this.jdbc.queryForList("select ok, error from comic_costs where comic_id = ?::uuid and step = 'script' order by id", id))
			.extracting(m -> m.get("ok")).containsExactly(false, true);
	}

	@Test
	void 대본이_두_번_다_어긋나면_그리지_않고_failed() throws Exception {
		this.ai.nextScript(() -> "죄송하지만 만들 수 없습니다");
		this.ai.nextScript(() -> "{\"character\":\"x\",\"panels\":[]}");
		String id = createId(this.me, dreamId());
		drain();
		assertThat(this.ai.drawCalls).hasValue(0);
		String r = read(this.me, id);
		assertThat((String) JsonPath.read(r, "$.status")).isEqualTo("failed");
		assertThat(this.jdbc.queryForObject("select fail_code from comics where id = ?::uuid", String.class, id))
			.isEqualTo("invalid_script");
		assertThat(this.jdbc.queryForMap("select title, dream_text, scenes from comics where id = ?::uuid", id).values())
			.containsOnlyNulls();
	}

	@Test
	void 서버가_죽어_멈춘_만화는_lease_가_지나면_failed() throws Exception {
		String id = createId(this.me, dreamId());
		this.jdbc.update("update comics set status = 'drawing', locked_at = now() - interval '11 minutes' where id = ?::uuid", id);
		this.worker.runOnce();
		assertThat((String) JsonPath.read(read(this.me, id), "$.status")).isEqualTo("failed");
		assertThat(this.jdbc.queryForObject("select fail_code from comics where id = ?::uuid", String.class, id))
			.isEqualTo("interrupted");
		assertThat(this.jdbc.queryForMap("select title, dream_text, scenes from comics where id = ?::uuid", id).values())
			.containsOnlyNulls();
	}

	// ---------------------------------------------------------------- 지우기

	@Test
	void 지우면_204_이고_그림도_지운다_두_번_지워도_204() throws Exception {
		String id = createId(this.me, dreamId());
		drain();
		String key = "comics/" + this.me.id() + "/" + id + "/grid.jpg";
		assertThat(this.storage.has(key)).isTrue();

		call(this.me, delete("/api/comics/" + id)).andExpect(status().isNoContent());
		assertThat(this.storage.has(key)).isFalse();
		call(this.me, get("/api/comics/" + id)).andExpect(status().isNotFound());
		call(this.me, delete("/api/comics/" + id)).andExpect(status().isNoContent());
		assertThat(this.jdbc.queryForMap("select panels, image_key from comics where id = ?::uuid", id).values())
			.containsOnlyNulls();
	}

	@Test
	void 그리는_사이_지우면_올린_그림을_치운다() throws Exception {
		String[] id = new String[1];
		this.ai.nextImage(() -> {
			this.jdbc.update("update comics set deleted_at = now() where id = ?::uuid", id[0]);
			return FakeComicAi.IMAGE;
		});
		id[0] = createId(this.me, dreamId());
		drain();
		assertThat(this.storage.keysUnder("comics/" + this.me.id() + "/")).isEmpty();
		assertThat(this.jdbc.queryForObject("select status from comics where id = ?::uuid", String.class, id[0]))
			.isEqualTo("drawing");
	}

	@Test
	void 계정을_지우면_만화_행과_그림이_사라지고_원가_기록은_남는다() throws Exception {
		String id = createId(this.me, dreamId());
		drain();
		this.deletion.delete(UUID.fromString(this.me.id()));

		assertThat(this.jdbc.queryForObject("select count(*) from comics where user_id = ?::uuid", Long.class, this.me.id()))
			.isZero();
		assertThat(this.storage.keysUnder("comics/" + this.me.id() + "/")).isEmpty();
		assertThat(this.jdbc.queryForObject("select count(*) from comic_costs where comic_id = ?::uuid", Long.class, id))
			.isEqualTo(2);
	}

	// ---------------------------------------------------------------- 03 꿈 나눔에 붙이기

	private String syncDream(Who who) throws Exception {
		String id = dreamId();
		call(who, post("/api/sync/dreams").contentType(MediaType.APPLICATION_JSON).content("""
				{"dreams":[{"id":"%s","recordedAt":"2026-10-10T21:00:00.000Z","title":"복도 꿈","text":"학교 복도",
				"deletedAt":null,"updatedAt":"2026-10-10T21:01:00.000Z"}]}""".formatted(id)))
			.andExpect(status().isOk());
		return id;
	}

	private ResultActions share(Who who, String dreamId, String comicId) throws Exception {
		return call(who, post("/api/community/posts").contentType(MediaType.APPLICATION_JSON).content("""
				{"dreamId":"%s","title":"복도 꿈","dreamText":"학교 복도","dreamRecordedAt":"2026-10-10T21:00:00.000Z",
				"body":"","comicId":%s}""".formatted(dreamId, comicId == null ? "null" : "\"" + comicId + "\"")));
	}

	@Test
	void 다_만든_만화를_붙여_올리면_그림을_글_쪽으로_복사하고_상세에_컷_글까지_준다() throws Exception {
		String dream = syncDream(this.me);
		String comic = createId(this.me, dream);
		drain();

		String postId = JsonPath.read(json(share(this.me, dream, comic).andExpect(status().isCreated())
			.andExpect(jsonPath("$.hasComic").value(true))), "$.id");
		String copy = "posts/" + postId + "/comic.jpg";
		assertThat(this.storage.has(copy)).isTrue();

		String detail = json(call(null, get("/api/community/posts/" + postId)).andExpect(status().isOk()));
		assertThat((String) JsonPath.read(detail, "$.comicUrl")).contains(copy);
		assertThat((String) JsonPath.read(detail, "$.comic.layout")).isEqualTo("grid2x2");
		assertThat((List<String>) JsonPath.read(detail, "$.comic.imageUrls")).singleElement().asString().contains(copy);
		assertThat((List<?>) JsonPath.read(detail, "$.comic.panels")).hasSize(4);
		assertThat((String) JsonPath.read(detail, "$.comic.panels[3].dialogue")).isEqualTo("늦었잖아");

		// 원래 만화를 지워도 글의 만화는 남는다
		call(this.me, delete("/api/comics/" + comic)).andExpect(status().isNoContent());
		assertThat(this.storage.has(copy)).isTrue();
		call(null, get("/api/community/posts/" + postId)).andExpect(jsonPath("$.comic.layout").value("grid2x2"));

		// 글을 지우면 복사본도 지운다
		call(this.me, delete("/api/community/posts/" + postId)).andExpect(status().isNoContent());
		assertThat(this.storage.has(copy)).isFalse();
	}

	@Test
	void 만화_없이_올린_글은_hasComic_false_이고_comic_은_null() throws Exception {
		String dream = syncDream(this.me);
		String postId = JsonPath.read(json(share(this.me, dream, null).andExpect(status().isCreated())
			.andExpect(jsonPath("$.hasComic").value(false))), "$.id");
		call(null, get("/api/community/posts/" + postId)).andExpect(jsonPath("$.comic").doesNotExist())
			.andExpect(jsonPath("$.comicUrl").doesNotExist());
	}

	@Test
	void 남의_것이거나_다_만들지_않은_만화는_400_invalid_comic_이고_글도_올라가지_않는다() throws Exception {
		Who other = login();
		String othersComic = createId(other, dreamId());
		drain();
		String dream = syncDream(this.me);
		share(this.me, dream, othersComic).andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.code").value("invalid_comic"));

		String mine = createId(this.me, dreamId());
		share(this.me, dream, mine).andExpect(status().isBadRequest());
		share(this.me, dream, "not-a-uuid").andExpect(status().isBadRequest());

		call(this.me, get("/api/community/dreams/" + dream + "/post")).andExpect(jsonPath("$.postId").doesNotExist());
	}

	@Test
	void 계정을_지우면_글에_붙인_만화_그림도_지운다() throws Exception {
		String dream = syncDream(this.me);
		String comic = createId(this.me, dream);
		drain();
		String postId = JsonPath.read(json(share(this.me, dream, comic).andExpect(status().isCreated())), "$.id");

		this.deletion.delete(UUID.fromString(this.me.id()));
		assertThat(this.storage.keysUnder("posts/" + postId + "/")).isEmpty();
		assertThat(this.jdbc.queryForMap("select comic_layout, comic_image_key, comic_panels from posts where id = ?::uuid",
				postId).values()).containsOnlyNulls();
	}
}
