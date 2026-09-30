package com.kkume.server.community;

import java.time.Instant;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;

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

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.JwsHeader;
import org.springframework.security.oauth2.jwt.JwtClaimsSet;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtEncoderParameters;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import com.kkume.server.TestcontainersConfiguration;
import com.kkume.server.auth.GoogleTokenVerifier;
import com.kkume.server.auth.SocialIdentity;
import com.kkume.server.user.Provider;

/**
 * 커뮤니티를 로그인부터 끝까지 돌린다. 계약은 문서 056(모바일 057에서 수용).
 *
 * <p>경우 이름(C · N · F)은 모바일 가짜 서버의 규칙 테스트({@code mobile/scripts/community/cases.mjs})와 같다 —
 * 가짜와 진짜가 같은 규칙으로 답하는지 양쪽에서 본다.
 *
 * <p>다른 테스트가 만든 글도 같은 DB 에 있으므로 피드는 "들어 있는가 · 빠졌는가"로만 보고,
 * 순서 · 개수는 그 테스트가 만든 사람의 글 목록으로 본다.
 */
@Import(TestcontainersConfiguration.class)
@SpringBootTest
@AutoConfigureMockMvc
class CommunityApiTest {

	@Autowired
	private MockMvc mockMvc;

	@Autowired
	private JwtEncoder jwtEncoder;

	@MockitoBean
	private GoogleTokenVerifier googleVerifier;

	/** 로그인한 사람. {@code id}는 사용자 id, {@code token}은 앱 토큰 */
	private record Who(String id, String token, String nickname) {
	}

	private Who me;

	private Who other;

	@BeforeEach
	void accounts() throws Exception {
		this.me = login();
		this.other = login();
	}

	// ---------------------------------------------------------------- 도우미

	private Who login() throws Exception {
		given(this.googleVerifier.verify(anyString()))
			.willReturn(new SocialIdentity(Provider.GOOGLE, "google-sub-" + UUID.randomUUID()));
		String r = this.mockMvc
			.perform(post("/api/auth/google").contentType(MediaType.APPLICATION_JSON).content("{\"idToken\":\"x\"}"))
			.andExpect(status().isOk())
			.andReturn().getResponse().getContentAsString();
		return new Who(JsonPath.read(r, "$.user.id"), JsonPath.read(r, "$.accessToken"), JsonPath.read(r, "$.user.nickname"));
	}

	private static MockHttpServletRequestBuilder as(Who who, MockHttpServletRequestBuilder req) {
		return who == null ? req : req.header("Authorization", "Bearer " + who.token());
	}

	private ResultActions call(Who who, MockHttpServletRequestBuilder req) throws Exception {
		return this.mockMvc.perform(as(who, req));
	}

	private ResultActions call(Who who, MockHttpServletRequestBuilder req, String json) throws Exception {
		return this.mockMvc.perform(as(who, req).contentType(MediaType.APPLICATION_JSON).content(json));
	}

	private static String json(ResultActions r) throws Exception {
		return r.andReturn().getResponse().getContentAsString();
	}

	private static String code(ResultActions r) throws Exception {
		return JsonPath.read(json(r), "$.code");
	}

	/** 꿈 하나를 동기화로 올린다. 글쓰기는 서버에 있는 내 꿈만 받는다 */
	private String dream(Who who) throws Exception {
		return dream(who, null);
	}

	private String dream(Who who, String deletedAt) throws Exception {
		String id = "d-" + UUID.randomUUID().toString().substring(0, 12);
		call(who, post("/api/sync/dreams"), """
				{"dreams":[{"id":"%s","recordedAt":"2026-09-29T21:00:00.000Z","title":"원래 제목","text":"원래 꿈 내용",
				"deletedAt":%s,"updatedAt":"2026-09-29T21:01:00.000Z"}]}"""
			.formatted(id, deletedAt == null ? "null" : "\"" + deletedAt + "\""))
			.andExpect(status().isOk());
		return id;
	}

	private ResultActions share(Who who, String dreamId, String title, String dreamText, String body) throws Exception {
		return call(who, post("/api/community/posts"), """
				{"dreamId":"%s","title":%s,"dreamText":%s,"dreamRecordedAt":"2026-09-29T21:00:00.000Z","body":%s}"""
			.formatted(dreamId, quote(title), quote(dreamText), quote(body)));
	}

	/** 새 꿈을 만들어 공유하고 글 id 를 돌려준다 */
	private String newPost(Who who) throws Exception {
		return JsonPath.read(json(share(who, dream(who), "제목", "꿈 내용", "").andExpect(status().isCreated())), "$.id");
	}

	private static String quote(String s) {
		return s == null ? "null" : "\"" + s.replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", "\\n") + "\"";
	}

	private ResultActions comment(Who who, String postId, String body, String parentId) throws Exception {
		return call(who, post("/api/community/posts/" + postId + "/comments"),
				"{\"body\":%s,\"parentId\":%s}".formatted(quote(body), quote(parentId)));
	}

	private String commentId(Who who, String postId, String body, String parentId) throws Exception {
		return JsonPath.read(json(comment(who, postId, body, parentId).andExpect(status().isCreated())), "$.id");
	}

	private ResultActions report(Who who, String type, String id) throws Exception {
		return call(who, post("/api/community/reports"), "{\"type\":\"%s\",\"id\":\"%s\",\"reason\":\"spam\"}".formatted(type, id));
	}

	/** 서로 다른 세 사람이 신고해 가린다 */
	private void hideByReports(String type, String id) throws Exception {
		for (int i = 0; i < 3; i++) {
			report(login(), type, id).andExpect(status().isNoContent());
		}
	}

	private List<String> feedIds(Who who, String sort) throws Exception {
		return JsonPath.read(json(call(who, get("/api/community/posts").param("sort", sort)).andExpect(status().isOk())),
				"$.items[*].id");
	}

	private List<String> postsOf(Who viewer, Who author, String sort) throws Exception {
		return JsonPath.read(json(call(viewer, get("/api/users/" + author.id() + "/posts").param("sort", sort))
			.andExpect(status().isOk())), "$.items[*].id");
	}

	private ResultActions like(Who who, String postId, boolean liked) throws Exception {
		return call(who, put("/api/community/posts/" + postId + "/like"), "{\"liked\":" + liked + "}");
	}

	private String postForDream(Who who, String dreamId) throws Exception {
		return JsonPath.read(json(call(who, get("/api/community/dreams/" + dreamId + "/post")).andExpect(status().isOk())),
				"$.postId");
	}

	// ---------------------------------------------------------------- 읽기 · 쓰기 기본 (C)

	@Test
	void C1_로그인_전에도_피드와_글과_프로필을_읽는다() throws Exception {
		String postId = newPost(this.me);

		assertThat(feedIds(null, "latest")).contains(postId);
		call(null, get("/api/community/posts/" + postId)).andExpect(status().isOk());
		call(null, get("/api/users/" + this.me.id() + "/profile")).andExpect(status().isOk());
		call(null, get("/api/users/" + this.me.id() + "/posts")).andExpect(status().isOk());
	}

	@Test
	void C2_로그인_전_쓰기는_401이고_본문에_코드가_있다() throws Exception {
		String postId = newPost(this.me);

		ResultActions r = call(null, post("/api/community/posts/" + postId + "/comments"), "{\"body\":\"x\"}")
			.andExpect(status().isUnauthorized());
		assertThat(code(r)).isEqualTo("unauthorized");
		call(null, get("/api/community/dreams/x/post")).andExpect(status().isUnauthorized());
		call(null, get("/api/community/blocks")).andExpect(status().isUnauthorized());
	}

	@Test
	void F8_토큰을_보냈으면_읽기에서도_맞아야_한다() throws Exception {
		Instant past = Instant.now().minusSeconds(3600);
		JwtClaimsSet claims = JwtClaimsSet.builder().subject(this.me.id()).issuedAt(past.minusSeconds(60)).expiresAt(past).build();
		String expired = this.jwtEncoder
			.encode(JwtEncoderParameters.from(JwsHeader.with(MacAlgorithm.HS256).build(), claims)).getTokenValue();

		ResultActions r = this.mockMvc.perform(get("/api/community/posts").header("Authorization", "Bearer " + expired))
			.andExpect(status().isUnauthorized());
		assertThat(code(r)).isEqualTo("unauthorized");
		// 토큰 없이 부르면 된다 — 앱은 만료된 토큰을 붙이지 않는다
		call(null, get("/api/community/posts")).andExpect(status().isOk());
	}

	@Test
	void C3_C4_C5_답글은_한_단계이고_부모_바로_뒤에_온다() throws Exception {
		String postId = newPost(this.me);
		String top = commentId(this.other, postId, "첫 댓글", null);
		String second = commentId(this.other, postId, "둘째 댓글", null);
		String reply = commentId(this.me, postId, "첫 댓글의 답글", top);

		assertThat(code(comment(this.other, postId, "답글의 답글", reply).andExpect(status().isBadRequest())))
			.isEqualTo("reply_depth");

		List<String> order = JsonPath.read(json(call(null, get("/api/community/posts/" + postId))), "$.comments[*].id");
		assertThat(order).containsExactly(top, reply, second);
	}

	@Test
	void 다른_글의_댓글을_부모로_주면_404다() throws Exception {
		String a = newPost(this.me);
		String b = newPost(this.me);
		String onA = commentId(this.other, a, "a 의 댓글", null);

		assertThat(code(comment(this.other, b, "엉뚱한 부모", onA).andExpect(status().isNotFound())))
			.isEqualTo("comment_not_found");
	}

	@Test
	void 댓글은_앞뒤_공백을_자르고_1자에서_500자다() throws Exception {
		String postId = newPost(this.me);

		assertThat(code(comment(this.other, postId, "   ", null).andExpect(status().isBadRequest()))).isEqualTo("comment_empty");
		assertThat(code(comment(this.other, postId, "가".repeat(501), null).andExpect(status().isBadRequest())))
			.isEqualTo("comment_too_long");
		String r = json(comment(this.other, postId, "  " + "가".repeat(500) + "  ", null).andExpect(status().isCreated()));
		assertThat(JsonPath.<String>read(r, "$.body")).hasSize(500);
	}

	@Test
	void C10_공감은_원하는_상태를_보내고_두_번_보내도_한_번이다() throws Exception {
		String postId = newPost(this.me);

		like(this.other, postId, true).andExpect(status().isOk());
		String r = json(like(this.other, postId, true).andExpect(status().isOk()));
		assertThat(JsonPath.<Integer>read(r, "$.likeCount")).isEqualTo(1);
		assertThat(JsonPath.<Boolean>read(r, "$.likedByMe")).isTrue();

		// 내 글에도 공감할 수 있다(056 확정 3)
		assertThat(JsonPath.<Integer>read(json(like(this.me, postId, true)), "$.likeCount")).isEqualTo(2);

		String off = json(like(this.other, postId, false).andExpect(status().isOk()));
		assertThat(JsonPath.<Integer>read(off, "$.likeCount")).isEqualTo(1);
		assertThat(JsonPath.<Boolean>read(off, "$.likedByMe")).isFalse();

		String asMe = json(call(this.me, get("/api/community/posts/" + postId)));
		assertThat(JsonPath.<Boolean>read(asMe, "$.likedByMe")).isTrue();
		// 로그인하지 않으면 늘 false
		assertThat(JsonPath.<Boolean>read(json(call(null, get("/api/community/posts/" + postId))), "$.likedByMe")).isFalse();
	}

	@Test
	void C11_C12_내_글은_신고할_수_없고_남의_글은_지울_수_없다() throws Exception {
		String postId = newPost(this.me);

		assertThat(code(report(this.me, "post", postId).andExpect(status().isBadRequest()))).isEqualTo("self_report");
		assertThat(code(call(this.other, delete("/api/community/posts/" + postId)).andExpect(status().isForbidden())))
			.isEqualTo("not_owner");
	}

	@Test
	void C13_지운_글은_피드에서_빠지고_상세는_404다() throws Exception {
		String postId = newPost(this.me);
		call(this.me, delete("/api/community/posts/" + postId)).andExpect(status().isNoContent());

		assertThat(feedIds(null, "latest")).doesNotContain(postId);
		assertThat(code(call(this.me, get("/api/community/posts/" + postId)).andExpect(status().isNotFound())))
			.isEqualTo("post_not_found");
	}

	@Test
	void C14_답글_달린_댓글을_지우면_자리만_남고_답글도_지우면_자리도_사라진다() throws Exception {
		String postId = newPost(this.me);
		String top = commentId(this.other, postId, "지울 댓글", null);
		String reply = commentId(this.me, postId, "답글", top);

		call(this.other, delete("/api/community/comments/" + top)).andExpect(status().isNoContent());
		String d = json(call(null, get("/api/community/posts/" + postId)));
		assertThat(JsonPath.<List<String>>read(d, "$.comments[*].id")).containsExactly(top, reply);
		assertThat(JsonPath.<Boolean>read(d, "$.comments[0].deleted")).isTrue();
		assertThat(JsonPath.<String>read(d, "$.comments[0].body")).isEmpty();
		// 보이는 댓글 수에 자리는 들어가지 않는다
		assertThat(JsonPath.<Integer>read(d, "$.commentCount")).isEqualTo(1);

		call(this.me, delete("/api/community/comments/" + reply)).andExpect(status().isNoContent());
		String after = json(call(null, get("/api/community/posts/" + postId)));
		assertThat(JsonPath.<List<String>>read(after, "$.comments")).isEmpty();
		assertThat(JsonPath.<Integer>read(after, "$.commentCount")).isZero();
	}

	@Test
	void 남의_댓글은_지울_수_없다() throws Exception {
		String postId = newPost(this.me);
		String c = commentId(this.other, postId, "댓글", null);

		assertThat(code(call(this.me, delete("/api/community/comments/" + c)).andExpect(status().isForbidden())))
			.isEqualTo("not_owner");
	}

	@Test
	void C15_프로필은_닉네임_가입_시각_글_수다() throws Exception {
		newPost(this.me);
		newPost(this.me);

		String r = json(call(null, get("/api/users/" + this.me.id() + "/profile")).andExpect(status().isOk()));
		assertThat(JsonPath.<String>read(r, "$.nickname")).isEqualTo(this.me.nickname());
		assertThat(JsonPath.<Integer>read(r, "$.postCount")).isEqualTo(2);
		assertThat(JsonPath.<String>read(r, "$.joinedAt")).isNotBlank();

		call(null, get("/api/users/" + UUID.randomUUID() + "/profile")).andExpect(status().isNotFound());
		call(null, get("/api/users/not-a-uuid/posts")).andExpect(status().isNotFound());
	}

	// ---------------------------------------------------------------- 신고로 가리기 (C6 ~ C8, F1 ~ F7)

	@Test
	void C6_C8_서로_다른_세_명이_신고하면_가리고_같은_사람의_두_번째는_세지_않는다() throws Exception {
		String postId = newPost(this.me);
		Who a = login();
		Who b = login();

		report(a, "post", postId).andExpect(status().isNoContent());
		report(a, "post", postId).andExpect(status().isNoContent());
		report(b, "post", postId).andExpect(status().isNoContent());
		assertThat(feedIds(null, "latest")).contains(postId);

		report(login(), "post", postId).andExpect(status().isNoContent());
		assertThat(feedIds(null, "latest")).doesNotContain(postId);
	}

	@Test
	void C7_F6_가려진_글은_남에게_없는_글이다() throws Exception {
		String postId = newPost(this.me);
		hideByReports("post", postId);

		call(this.other, get("/api/community/posts/" + postId)).andExpect(status().isNotFound());
		call(null, get("/api/community/posts/" + postId)).andExpect(status().isNotFound());
		assertThat(postsOf(this.other, this.me, "latest")).doesNotContain(postId);
		assertThat(JsonPath.<Integer>read(json(call(this.other, get("/api/users/" + this.me.id() + "/profile"))), "$.postCount"))
			.isZero();
	}

	@Test
	void F2_가려진_내_글은_내_목록과_상세에_hidden으로_온다() throws Exception {
		String postId = newPost(this.me);
		hideByReports("post", postId);

		String list = json(call(this.me, get("/api/users/" + this.me.id() + "/posts")));
		assertThat(JsonPath.<List<Boolean>>read(list, "$.items[?(@.id=='" + postId + "')].hidden")).containsExactly(true);
		assertThat(JsonPath.<Boolean>read(json(call(this.me, get("/api/community/posts/" + postId)).andExpect(status().isOk())),
				"$.hidden")).isTrue();
		assertThat(JsonPath.<Integer>read(json(call(this.me, get("/api/users/" + this.me.id() + "/profile"))), "$.postCount"))
			.isEqualTo(1);
		// 가려진 글은 피드에는 작성자에게도 없다
		assertThat(feedIds(this.me, "latest")).doesNotContain(postId);
	}

	@Test
	void F3_가려진_글은_작성자라도_공감과_댓글이_404다() throws Exception {
		String postId = newPost(this.me);
		hideByReports("post", postId);

		assertThat(code(like(this.me, postId, true).andExpect(status().isNotFound()))).isEqualTo("post_not_found");
		assertThat(code(comment(this.me, postId, "x", null).andExpect(status().isNotFound()))).isEqualTo("post_not_found");
	}

	@Test
	void F4_F5_가려진_글도_꿈_하나의_글이고_지우면_다시_공유된다() throws Exception {
		String dreamId = dream(this.me);
		String postId = JsonPath.read(json(share(this.me, dreamId, "t", "꿈", "").andExpect(status().isCreated())), "$.id");
		hideByReports("post", postId);

		assertThat(postForDream(this.me, dreamId)).isEqualTo(postId);
		ResultActions dup = share(this.me, dreamId, "t", "꿈", "").andExpect(status().isConflict());
		assertThat(JsonPath.<String>read(json(dup), "$.postId")).isEqualTo(postId);

		call(this.me, delete("/api/community/posts/" + postId)).andExpect(status().isNoContent());
		assertThat(postForDream(this.me, dreamId)).isNull();
		share(this.me, dreamId, "t", "꿈", "").andExpect(status().isCreated());
	}

	@Test
	void F7_보이는_글은_hidden이_false다() throws Exception {
		String postId = newPost(this.me);
		String r = json(call(null, get("/api/community/posts").param("sort", "latest")));
		assertThat(JsonPath.<List<Boolean>>read(r, "$.items[?(@.id=='" + postId + "')].hidden")).containsExactly(false);
	}

	@Test
	void 남에게_가려진_글은_지우려_해도_404다() throws Exception {
		String postId = newPost(this.me);
		hideByReports("post", postId);

		call(this.other, delete("/api/community/posts/" + postId)).andExpect(status().isNotFound());
	}

	@Test
	void 댓글도_세_명이_신고하면_가리고_답글이_있으면_자리만_남는다() throws Exception {
		String postId = newPost(this.me);
		String top = commentId(this.other, postId, "신고될 댓글", null);
		String reply = commentId(this.me, postId, "답글", top);

		assertThat(code(report(this.other, "comment", top).andExpect(status().isBadRequest()))).isEqualTo("self_report");
		hideByReports("comment", top);

		String d = json(call(null, get("/api/community/posts/" + postId)));
		assertThat(JsonPath.<List<String>>read(d, "$.comments[*].id")).containsExactly(top, reply);
		assertThat(JsonPath.<Boolean>read(d, "$.comments[0].deleted")).isTrue();
		assertThat(JsonPath.<Integer>read(d, "$.commentCount")).isEqualTo(1);
	}

	@Test
	void 신고_대상과_사유가_틀리면_거절한다() throws Exception {
		String postId = newPost(this.me);

		assertThat(code(call(this.other, post("/api/community/reports"),
				"{\"type\":\"post\",\"id\":\"%s\",\"reason\":\"boring\"}".formatted(postId)).andExpect(status().isBadRequest())))
			.isEqualTo("invalid_report");
		assertThat(code(report(this.other, "user", postId).andExpect(status().isBadRequest()))).isEqualTo("invalid_report");
		assertThat(code(report(this.other, "post", UUID.randomUUID().toString()).andExpect(status().isNotFound())))
			.isEqualTo("post_not_found");
	}

	// ---------------------------------------------------------------- 꿈 나눔 · 꿈당 한 글 (N1 ~ N7, F1)

	@Test
	void N1_N2_N3_고친_제목과_꿈_내용이_그대로이고_한마디는_비어도_되며_발췌는_꿈_내용에서다() throws Exception {
		String r = json(share(this.me, dream(this.me), "고친 제목", "고친 꿈 내용이\n목록에   \n  보인다", "")
			.andExpect(status().isCreated()));
		String postId = JsonPath.read(r, "$.id");
		assertThat(JsonPath.<String>read(r, "$.excerpt")).isEqualTo("고친 꿈 내용이 목록에 보인다");

		String d = json(call(null, get("/api/community/posts/" + postId)));
		assertThat(JsonPath.<String>read(d, "$.title")).isEqualTo("고친 제목");
		assertThat(JsonPath.<String>read(d, "$.dreamText")).isEqualTo("고친 꿈 내용이\n목록에   \n  보인다");
		assertThat(JsonPath.<String>read(d, "$.body")).isEmpty();
		assertThat(JsonPath.<Boolean>read(d, "$.hasComic")).isFalse();
		assertThat(JsonPath.<Object>read(d, "$.comicUrl")).isNull();
	}

	@Test
	void 발췌는_120자에서_자른다() throws Exception {
		String r = json(share(this.me, dream(this.me), null, "가".repeat(300), "").andExpect(status().isCreated()));
		assertThat(JsonPath.<String>read(r, "$.excerpt")).hasSize(120);
		// 빈 제목은 null 로 둔다 — 화면이 꿈 내용 첫 줄로 물러선다
		assertThat(JsonPath.<Object>read(r, "$.title")).isNull();
	}

	@Test
	void N4_같은_꿈을_두_번_공유하면_409와_그_글의_id다() throws Exception {
		String dreamId = dream(this.me);
		String first = JsonPath.read(json(share(this.me, dreamId, "t", "꿈", "").andExpect(status().isCreated())), "$.id");

		ResultActions dup = share(this.me, dreamId, "다른 제목", "다른 내용", "").andExpect(status().isConflict());
		assertThat(code(dup)).isEqualTo("already_shared");
		assertThat(JsonPath.<String>read(json(dup), "$.postId")).isEqualTo(first);
	}

	@Test
	void N5_N6_N7_F1_이_꿈으로_쓴_내_글() throws Exception {
		String dreamId = dream(this.me);
		assertThat(postForDream(this.me, dreamId)).isNull();

		String postId = JsonPath.read(json(share(this.me, dreamId, "t", "꿈", "")), "$.id");
		assertThat(postForDream(this.me, dreamId)).isEqualTo(postId);
		// 남의 꿈 · 서버에 없는 꿈이어도 404 가 아니라 null(056 확정 1)
		assertThat(postForDream(this.other, dreamId)).isNull();
		assertThat(postForDream(this.me, "not-synced-yet")).isNull();

		call(this.me, delete("/api/community/posts/" + postId)).andExpect(status().isNoContent());
		assertThat(postForDream(this.me, dreamId)).isNull();
	}

	@Test
	void 서버에_없는_꿈_남의_꿈_지운_꿈으로는_쓸_수_없다() throws Exception {
		assertThat(code(share(this.me, "not-synced-yet", "t", "꿈", "").andExpect(status().isNotFound())))
			.isEqualTo("dream_not_found");
		assertThat(code(share(this.other, dream(this.me), "t", "꿈", "").andExpect(status().isNotFound())))
			.isEqualTo("dream_not_found");
		assertThat(code(share(this.me, dream(this.me, "2026-09-29T22:00:00Z"), "t", "꿈", "").andExpect(status().isConflict())))
			.isEqualTo("dream_deleted");
	}

	@Test
	void 글의_상한() throws Exception {
		String dreamId = dream(this.me);
		assertThat(code(share(this.me, dreamId, "t", "  ", "").andExpect(status().isBadRequest()))).isEqualTo("dream_text_empty");
		assertThat(code(share(this.me, dreamId, "t", "가".repeat(20_001), "").andExpect(status().isBadRequest())))
			.isEqualTo("dream_text_too_long");
		assertThat(code(share(this.me, dreamId, "가".repeat(256), "꿈", "").andExpect(status().isBadRequest())))
			.isEqualTo("title_too_long");
		assertThat(code(share(this.me, dreamId, "t", "꿈", "가".repeat(2_001)).andExpect(status().isBadRequest())))
			.isEqualTo("body_too_long");
		share(this.me, dreamId, "가".repeat(255), "가".repeat(20_000), "가".repeat(2_000)).andExpect(status().isCreated());
	}

	@Test
	void 공유한_뒤_꿈을_고쳐도_글은_그대로다() throws Exception {
		String dreamId = dream(this.me);
		String postId = JsonPath.read(json(share(this.me, dreamId, "올린 제목", "올린 꿈", "")), "$.id");

		call(this.me, post("/api/sync/dreams"), """
				{"dreams":[{"id":"%s","recordedAt":"2026-09-29T21:00:00.000Z","title":"나중에 고친 제목","text":"비공개로 고친 내용",
				"updatedAt":"2026-09-30T08:00:00.000Z"}]}""".formatted(dreamId)).andExpect(status().isOk());

		String d = json(call(null, get("/api/community/posts/" + postId)));
		assertThat(JsonPath.<String>read(d, "$.title")).isEqualTo("올린 제목");
		assertThat(JsonPath.<String>read(d, "$.dreamText")).isEqualTo("올린 꿈");
	}

	// ---------------------------------------------------------------- 정렬과 쪽 (N8 ~ N10, 확정 2)

	@Test
	void N8_N9_N10_두_정렬() throws Exception {
		String a = newPost(this.me);
		String b = newPost(this.me);
		String c = newPost(this.me);
		like(this.other, a, true);
		like(login(), a, true);
		like(this.other, b, true);

		assertThat(postsOf(null, this.me, "latest")).containsExactly(c, b, a);
		// 공감 많은 순, 같으면 최신(c 는 0개)
		assertThat(postsOf(null, this.me, "empathy")).containsExactly(a, b, c);
		assertThat(feedIds(null, "empathy")).isNotEmpty();
		assertThat(code(call(null, get("/api/community/posts").param("sort", "hot")).andExpect(status().isBadRequest())))
			.isEqualTo("invalid_sort");
	}

	@Test
	void 한_쪽은_20개이고_커서로_이어지며_겹치지_않는다() throws Exception {
		List<String> made = new ArrayList<>();
		for (int i = 0; i < 23; i++) {
			made.add(newPost(this.me));
		}
		for (String sort : List.of("latest", "empathy")) {
			String first = json(call(null, get("/api/users/" + this.me.id() + "/posts").param("sort", sort)));
			List<String> p1 = JsonPath.read(first, "$.items[*].id");
			String cursor = JsonPath.read(first, "$.nextCursor");
			assertThat(p1).hasSize(20);
			assertThat(cursor).isNotNull();

			String second = json(call(null, get("/api/users/" + this.me.id() + "/posts").param("sort", sort).param("cursor", cursor)));
			List<String> p2 = JsonPath.read(second, "$.items[*].id");
			assertThat(p2).hasSize(3);
			assertThat(JsonPath.<Object>read(second, "$.nextCursor")).isNull();

			Set<String> all = new HashSet<>(p1);
			all.addAll(p2);
			assertThat(all).containsExactlyInAnyOrderElementsOf(made);
		}
	}

	@Test
	void 다른_정렬의_커서와_망가진_커서는_거절한다() throws Exception {
		for (int i = 0; i < 21; i++) {
			newPost(this.me);
		}
		String cursor = JsonPath.read(json(call(null, get("/api/users/" + this.me.id() + "/posts").param("sort", "latest"))),
				"$.nextCursor");

		assertThat(code(call(null, get("/api/users/" + this.me.id() + "/posts").param("sort", "empathy").param("cursor", cursor))
			.andExpect(status().isBadRequest()))).isEqualTo("invalid_cursor");
		assertThat(code(call(null, get("/api/community/posts").param("cursor", "garbage")).andExpect(status().isBadRequest())))
			.isEqualTo("invalid_cursor");
	}

	// ---------------------------------------------------------------- 차단 (F9 ~ F15)

	@Test
	void F9_나를_차단하면_self_block() throws Exception {
		assertThat(code(call(this.me, put("/api/community/blocks/" + this.me.id())).andExpect(status().isBadRequest())))
			.isEqualTo("self_block");
		call(this.me, put("/api/community/blocks/" + UUID.randomUUID())).andExpect(status().isNotFound());
	}

	@Test
	void F10_F11_F12_차단하면_피드와_댓글에서만_거른다() throws Exception {
		Who owl = login();
		String owlPost = newPost(owl);
		String myPost = newPost(this.me);
		String owlComment = commentId(owl, myPost, "올빼미 댓글", null);
		String reply = commentId(this.other, myPost, "그 댓글의 답글", owlComment);
		String owlLone = commentId(owl, myPost, "답글 없는 올빼미 댓글", null);

		call(this.me, put("/api/community/blocks/" + owl.id())).andExpect(status().isNoContent());

		assertThat(feedIds(this.me, "latest")).doesNotContain(owlPost);
		String d = json(call(this.me, get("/api/community/posts/" + myPost)));
		assertThat(JsonPath.<List<String>>read(d, "$.comments[*].id")).containsExactly(owlComment, reply).doesNotContain(owlLone);
		assertThat(JsonPath.<Boolean>read(d, "$.comments[0].deleted")).isTrue();
		assertThat(JsonPath.<String>read(d, "$.comments[0].body")).isEmpty();

		// 일부러 찾아 들어간 자리는 거르지 않는다
		assertThat(postsOf(this.me, owl, "latest")).contains(owlPost);
		call(this.me, get("/api/community/posts/" + owlPost)).andExpect(status().isOk());
		call(this.me, get("/api/users/" + owl.id() + "/profile")).andExpect(status().isOk());
	}

	@Test
	void F13_F14_F15_차단_목록과_풀기와_한쪽_방향() throws Exception {
		Who owl = login();
		String owlPost = newPost(owl);
		call(this.me, put("/api/community/blocks/" + owl.id())).andExpect(status().isNoContent());
		call(this.me, put("/api/community/blocks/" + owl.id())).andExpect(status().isNoContent());

		String list = json(call(this.me, get("/api/community/blocks")).andExpect(status().isOk()));
		assertThat(JsonPath.<List<String>>read(list, "$.items[*].id")).containsExactly(owl.id());
		assertThat(JsonPath.<List<String>>read(list, "$.items[*].nickname")).containsExactly(owl.nickname());

		// 상대의 목록은 그대로고, 상대는 내 글을 본다
		assertThat(JsonPath.<List<String>>read(json(call(owl, get("/api/community/blocks"))), "$.items")).isEmpty();
		String myPost = newPost(this.me);
		assertThat(feedIds(owl, "latest")).contains(myPost);

		call(this.me, delete("/api/community/blocks/" + owl.id())).andExpect(status().isNoContent());
		assertThat(feedIds(this.me, "latest")).contains(owlPost);
		assertThat(JsonPath.<List<String>>read(json(call(this.me, get("/api/community/blocks"))), "$.items")).isEmpty();
	}

	// ---------------------------------------------------------------- 닉네임 (F16, F17)

	@Test
	void F16_닉네임은_2에서_16자이고_줄바꿈은_안_된다() throws Exception {
		for (String bad : List.of("가", "가".repeat(17), "가\n나", "   ")) {
			assertThat(code(call(this.me, patch("/api/me"), "{\"nickname\":%s}".formatted(quote(bad))).andExpect(status().isBadRequest())))
				.isEqualTo("nickname_invalid");
		}
		call(this.me, patch("/api/me"), "{\"nickname\":\"" + "가".repeat(16) + "\"}").andExpect(status().isOk());
	}

	@Test
	void F17_앞뒤_공백을_자르고_지난_글의_작성자_이름도_바뀐다() throws Exception {
		String postId = newPost(this.me);
		String c = commentId(this.me, postId, "내 댓글", null);

		String r = json(call(this.me, patch("/api/me"), "{\"nickname\":\"  새 이름  \"}").andExpect(status().isOk()));
		assertThat(JsonPath.<String>read(r, "$.nickname")).isEqualTo("새 이름");

		String d = json(call(null, get("/api/community/posts/" + postId)));
		assertThat(JsonPath.<String>read(d, "$.author.nickname")).isEqualTo("새 이름");
		assertThat(JsonPath.<List<String>>read(d, "$.comments[?(@.id=='" + c + "')].author.nickname")).containsExactly("새 이름");
		// 닉네임은 식별자가 아니라 겹쳐도 된다
		call(this.other, patch("/api/me"), "{\"nickname\":\"새 이름\"}").andExpect(status().isOk());
	}
}
