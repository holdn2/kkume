package com.kkume.server.dream;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.BDDMockito.given;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import com.kkume.server.TestcontainersConfiguration;
import com.kkume.server.auth.GoogleTokenVerifier;
import com.kkume.server.auth.SocialIdentity;
import com.kkume.server.user.Provider;

/**
 * 동기화 API 를 로그인부터 끝까지 실제로 돌린다.
 *
 * <p>여기서 보는 것은 응답 모양이 아니라 <b>기록이 사라지지 않는가</b>다 —
 * 지운 것이 되살아나지 않는지, 원본 오디오가 지워지지 않는지, 한 건이 잘못됐을 때
 * 나머지가 갇히지 않는지, 페이지 경계에서 한 건이 빠지지 않는지.
 */
@Import(TestcontainersConfiguration.class)
@SpringBootTest
@AutoConfigureMockMvc
class SyncApiTest {

	@Autowired
	private MockMvc mockMvc;

	@Autowired
	private DreamRepository dreams;

	@MockitoBean
	private GoogleTokenVerifier googleVerifier;

	/** 로그인해서 얻은 토큰과 사용자 id. 테스트마다 새 계정을 쓴다. */
	private record Account(String token, UUID id) {
	}

	private Account login() throws Exception {
		String sub = "google-sub-" + UUID.randomUUID();
		given(this.googleVerifier.verify(anyString()))
			.willReturn(new SocialIdentity(Provider.GOOGLE, sub));

		String response = this.mockMvc
			.perform(post("/api/auth/google").contentType(MediaType.APPLICATION_JSON)
				.content("{\"idToken\":\"whatever\"}"))
			.andExpect(status().isOk())
			.andReturn()
			.getResponse()
			.getContentAsString();

		return new Account(JsonPath.read(response, "$.accessToken"), UUID.fromString(JsonPath.read(response, "$.user.id")));
	}

	private static String payload(String id, Instant recordedAt, String title, Instant updatedAt) {
		return """
				{"id":"%s","recordedAt":"%s","title":"%s","text":"본문","durationMs":1200,"updatedAt":"%s"}"""
			.formatted(id, recordedAt, title, updatedAt);
	}

	private String push(Account account, String... items) throws Exception {
		String body = "{\"dreams\":[" + String.join(",", items) + "]}";
		return this.mockMvc
			.perform(post("/api/sync/dreams").header("Authorization", "Bearer " + account.token())
				.contentType(MediaType.APPLICATION_JSON)
				.content(body))
			.andExpect(status().isOk())
			.andReturn()
			.getResponse()
			.getContentAsString();
	}

	private String pull(Account account, String query) throws Exception {
		return this.mockMvc
			.perform(get("/api/sync/dreams" + query).header("Authorization", "Bearer " + account.token()))
			.andExpect(status().isOk())
			.andReturn()
			.getResponse()
			.getContentAsString();
	}

	private static String newId() {
		return Long.toString(System.currentTimeMillis(), 36) + "-" + UUID.randomUUID().toString().substring(0, 6);
	}

	@Test
	void 토큰이_없으면_읽지도_쓰지도_못한다() throws Exception {
		this.mockMvc.perform(get("/api/sync/dreams")).andExpect(status().isUnauthorized());
		this.mockMvc.perform(post("/api/sync/dreams").contentType(MediaType.APPLICATION_JSON)
			.content("{\"dreams\":[]}")).andExpect(status().isUnauthorized());
	}

	@Test
	void 올린_기록이_그대로_내려온다() throws Exception {
		Account account = login();
		Instant now = Instant.now();
		String id = newId();

		String pushed = push(account, payload(id, now, "고래 꿈", now));
		assertThat(JsonPath.<String>read(pushed, "$.results[0].status")).isEqualTo("saved");

		String pulled = pull(account, "");
		assertThat(JsonPath.<List<String>>read(pulled, "$.dreams[*].id")).containsExactly(id);
		assertThat(JsonPath.<String>read(pulled, "$.dreams[0].title")).isEqualTo("고래 꿈");
		// 오디오는 이 API 가 다루지 않는다. 다음 이슈에서 붙는다
		assertThat(JsonPath.<String>read(pulled, "$.dreams[0].audioUrl")).isNull();
		assertThat(JsonPath.<String>read(pulled, "$.dreams[0].sttStatus")).isEqualTo("pending");
	}

	@Test
	void 지운_기록도_내려받기에_담긴다() throws Exception {
		Account account = login();
		Instant now = Instant.now();
		String id = newId();
		push(account, payload(id, now, "지울 것", now));

		Instant later = now.plusSeconds(10);
		String deleted = """
				{"id":"%s","recordedAt":"%s","title":"지울 것","deletedAt":"%s","updatedAt":"%s"}"""
			.formatted(id, now, later, later);
		push(account, deleted);

		// 여기서 빠지면 기기는 삭제를 영영 모르고, 지운 기록이 다음 동기화에서 되살아난다
		String pulled = pull(account, "");
		assertThat(JsonPath.<List<String>>read(pulled, "$.dreams[*].id")).containsExactly(id);
		assertThat(JsonPath.<String>read(pulled, "$.dreams[0].deletedAt")).isNotNull();
	}

	@Test
	void 서버가_더_최신이면_덮어쓰지_않는다() throws Exception {
		Account account = login();
		Instant now = Instant.now();
		String id = newId();
		push(account, payload(id, now, "서버가 가진 것", now));

		// 오프라인이었다가 늦게 올라온 옛 수정
		String stale = payload(id, now, "폰에 있던 옛 것", now.minusSeconds(60));
		String result = push(account, stale);

		assertThat(JsonPath.<String>read(result, "$.results[0].status")).isEqualTo("skipped");
		assertThat(this.dreams.findById(id).orElseThrow().getTitle()).isEqualTo("서버가 가진 것");
	}

	@Test
	void 기기가_더_최신이면_반영된다() throws Exception {
		Account account = login();
		Instant now = Instant.now();
		String id = newId();
		push(account, payload(id, now, "처음", now));

		String result = push(account, payload(id, now, "고친 것", now.plusSeconds(60)));

		assertThat(JsonPath.<String>read(result, "$.results[0].status")).isEqualTo("saved");
		assertThat(this.dreams.findById(id).orElseThrow().getTitle()).isEqualTo("고친 것");
	}

	@Test
	void 한_건이_잘못돼도_나머지는_저장된다() throws Exception {
		Account account = login();
		Instant now = Instant.now();
		String good = newId();
		String tooLong = newId();

		String result = push(account,
				payload(good, now, "멀쩡한 것", now),
				payload(tooLong, now, "가".repeat(256), now));

		assertThat(JsonPath.<String>read(result, "$.results[0].status")).isEqualTo("saved");
		assertThat(JsonPath.<String>read(result, "$.results[1].status")).isEqualTo("rejected");
		assertThat(JsonPath.<String>read(result, "$.results[1].reason")).isEqualTo("title_too_long");
		// 전부 되돌리면 이 한 건 때문에 나머지가 영영 올라가지 못한다
		assertThat(this.dreams.findById(good)).isPresent();
		assertThat(this.dreams.findById(tooLong)).isEmpty();
	}

	@Test
	void id가_없으면_거절하고_이유를_알려준다() throws Exception {
		Account account = login();
		String result = push(account, "{\"recordedAt\":\"%s\",\"updatedAt\":\"%s\"}"
			.formatted(Instant.now(), Instant.now()));

		assertThat(JsonPath.<String>read(result, "$.results[0].status")).isEqualTo("rejected");
		assertThat(JsonPath.<String>read(result, "$.results[0].reason")).isEqualTo("missing_id");
	}

	@Test
	void 수정_시각이_없으면_덮어쓰지_않고_거절한다() throws Exception {
		Account account = login();
		Instant now = Instant.now();
		String id = newId();

		String result = push(account, """
				{"id":"%s","recordedAt":"%s","title":"시각 없음"}""".formatted(id, now));

		// 어느 쪽이 최신인지 판정할 수 없다. 추측해서 덮어쓰면 그때 기록이 사라진다
		assertThat(JsonPath.<String>read(result, "$.results[0].reason")).isEqualTo("missing_updated_at");
		assertThat(this.dreams.findById(id)).isEmpty();
	}

	@Test
	void 남의_기록은_덮어쓰지도_받아가지도_못한다() throws Exception {
		Account owner = login();
		Instant now = Instant.now();
		String id = newId();
		push(owner, payload(id, now, "내 꿈", now));

		Account stranger = login();
		String result = push(stranger, payload(id, now, "가로챈 것", now.plusSeconds(60)));

		assertThat(JsonPath.<String>read(result, "$.results[0].status")).isEqualTo("rejected");
		assertThat(JsonPath.<String>read(result, "$.results[0].reason")).isEqualTo("not_owned");
		assertThat(this.dreams.findById(id).orElseThrow().getTitle()).isEqualTo("내 꿈");

		String pulled = pull(stranger, "");
		assertThat(JsonPath.<List<String>>read(pulled, "$.dreams[*].id")).isEmpty();
	}

	@Test
	void 원본_오디오는_동기화로_지워지지_않는다() throws Exception {
		Account account = login();
		Instant now = Instant.now();
		String id = newId();
		push(account, payload(id, now, "녹음한 것", now));

		Dream dream = this.dreams.findById(id).orElseThrow();
		dream.attachAudio("https://s3.example/original.m4a", now);
		this.dreams.save(dream);

		// 기기는 S3 주소를 모른다. 그 상태로 올린 것이 원본을 지우면 안 된다
		push(account, payload(id, now, "낮에 고친 제목", now.plusSeconds(120)));

		Dream after = this.dreams.findById(id).orElseThrow();
		assertThat(after.getTitle()).isEqualTo("낮에 고친 제목");
		assertThat(after.getAudioUrl()).isEqualTo("https://s3.example/original.m4a");
	}

	@Test
	void 백건을_넘기면_받지_않는다() throws Exception {
		Account account = login();
		Instant now = Instant.now();
		String[] items = new String[SyncService.MAX_BATCH + 1];
		for (int i = 0; i < items.length; i++) {
			items[i] = payload(newId() + "-" + i, now, "기록 " + i, now);
		}
		String body = "{\"dreams\":[" + String.join(",", items) + "]}";

		// 앞의 100건만 처리하면 기기는 나머지도 올렸다고 믿고 다시 보내지 않는다
		this.mockMvc
			.perform(post("/api/sync/dreams").header("Authorization", "Bearer " + account.token())
				.contentType(MediaType.APPLICATION_JSON)
				.content(body))
			.andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.code").value("too_many"));
	}

	@Test
	void 같은_시각의_기록이_페이지_경계에_걸려도_빠지지_않는다() throws Exception {
		Account account = login();
		// 서버가 쓴 시각이 완전히 같은 두 건. 시각만으로 커서를 이으면 뒤엣것이 사라진다
		Instant same = Instant.now().truncatedTo(ChronoUnit.MICROS);
		String first = "aaa-" + UUID.randomUUID();
		String second = "bbb-" + UUID.randomUUID();
		this.dreams.save(new Dream(first, account.id(), same, same));
		this.dreams.save(new Dream(second, account.id(), same, same));

		String page1 = pull(account, "?limit=1");
		assertThat(JsonPath.<List<String>>read(page1, "$.dreams[*].id")).containsExactly(first);
		assertThat(JsonPath.<Boolean>read(page1, "$.hasMore")).isTrue();

		String nextSince = JsonPath.read(page1, "$.nextSince");
		String nextCursor = JsonPath.read(page1, "$.nextCursor");
		String page2 = pull(account, "?limit=1&since=" + nextSince + "&cursor=" + nextCursor);

		assertThat(JsonPath.<List<String>>read(page2, "$.dreams[*].id")).containsExactly(second);
	}

	@Test
	void 받을_것이_없으면_커서를_그대로_돌려준다() throws Exception {
		Account account = login();
		Instant now = Instant.now();
		String id = newId();
		push(account, payload(id, now, "하나", now));

		String first = pull(account, "");
		String since = JsonPath.read(first, "$.nextSince");
		String cursor = JsonPath.read(first, "$.nextCursor");

		String second = pull(account, "?since=" + since + "&cursor=" + cursor);
		assertThat(JsonPath.<List<String>>read(second, "$.dreams[*].id")).isEmpty();
		// 여기서 커서를 비우면 다음 요청이 처음부터 다시 받아 온다
		assertThat(JsonPath.<String>read(second, "$.nextCursor")).isEqualTo(cursor);
		assertThat(JsonPath.<Boolean>read(second, "$.hasMore")).isFalse();
	}
}
