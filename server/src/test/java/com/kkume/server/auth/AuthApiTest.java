package com.kkume.server.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.BDDMockito.given;
import static org.mockito.BDDMockito.willThrow;
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
import com.kkume.server.user.Provider;
import com.kkume.server.user.UserRepository;

/**
 * 로그인부터 인증된 요청까지 한 번에 본다.
 *
 * <p>구글 서명을 흉내 낼 수 없으므로 검증기만 대역으로 바꾸고, <b>그 뒤의 흐름은
 * 실제 코드로 돌린다</b> — 사용자 생성 · 토큰 발급 · 그 토큰으로 인증되는지까지.
 * 검증기 자체는 {@link GoogleTokenVerifierTest} 에서 따로 본다.
 */
@Import(TestcontainersConfiguration.class)
@SpringBootTest
@AutoConfigureMockMvc
class AuthApiTest {

	@Autowired
	private MockMvc mockMvc;

	@Autowired
	private UserRepository users;

	@MockitoBean
	private GoogleTokenVerifier googleVerifier;

	private static final String BODY = """
			{"idToken":"whatever","consentVersion":"2026-10-07"}""";

	@Test
	void 토큰이_없으면_401이다() throws Exception {
		mockMvc.perform(get("/api/me")).andExpect(status().isUnauthorized());
	}

	@Test
	void 아무_문자열이나_Bearer로_보내면_401이다() throws Exception {
		mockMvc.perform(get("/api/me").header("Authorization", "Bearer not-a-real-token"))
			.andExpect(status().isUnauthorized());
	}

	@Test
	void 구글_토큰이_틀리면_401이고_이유는_알려주지_않는다() throws Exception {
		willThrow(new InvalidSocialTokenException("대상이 다릅니다"))
			.given(this.googleVerifier).verify(anyString());

		mockMvc.perform(post("/api/auth/google").contentType(MediaType.APPLICATION_JSON).content(BODY))
			.andExpect(status().isUnauthorized())
			.andExpect(jsonPath("$.code").value("invalid_token"))
			// 왜 실패했는지 흘리면 토큰을 맞춰 보는 쪽에 힌트가 된다
			.andExpect(jsonPath("$.message").value("로그인에 실패했습니다"));
	}

	@Test
	void 처음_로그인하면_사용자가_만들어지고_그_토큰으로_인증된다() throws Exception {
		String sub = "google-sub-" + System.nanoTime();
		given(this.googleVerifier.verify(anyString()))
			.willReturn(new SocialIdentity(Provider.GOOGLE, sub));

		String response = mockMvc
			.perform(post("/api/auth/google").contentType(MediaType.APPLICATION_JSON).content(BODY))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.accessToken").isNotEmpty())
			.andExpect(jsonPath("$.user.nickname").isNotEmpty())
			.andReturn()
			.getResponse()
			.getContentAsString();

		String accessToken = JsonPath.read(response, "$.accessToken");
		String nickname = JsonPath.read(response, "$.user.nickname");

		// 실명이 아니라 랜덤 닉네임이어야 한다 (계획서 08장)
		assertThat(nickname).matches("\\S+ \\d{4}");
		assertThat(this.users.findByProviderAndProviderId(Provider.GOOGLE, sub)).isPresent();

		mockMvc.perform(get("/api/me").header("Authorization", "Bearer " + accessToken))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.provider").value("google"))
			.andExpect(jsonPath("$.nickname").value(nickname));
	}

	@Test
	void 같은_계정으로_다시_로그인해도_사용자가_늘지_않는다() throws Exception {
		String sub = "google-sub-repeat-" + System.nanoTime();
		given(this.googleVerifier.verify(anyString()))
			.willReturn(new SocialIdentity(Provider.GOOGLE, sub));

		for (int i = 0; i < 2; i++) {
			mockMvc.perform(post("/api/auth/google").contentType(MediaType.APPLICATION_JSON).content(BODY))
				.andExpect(status().isOk());
		}

		// 가입과 로그인을 나누지 않으므로, 두 번째 로그인이 새 계정을 만들면 안 된다
		assertThat(this.users.findByProviderAndProviderId(Provider.GOOGLE, sub)).isPresent();
		assertThat(this.users.findAll().stream()
			.filter(u -> sub.equals(u.getProviderId()))
			.count()).isEqualTo(1);
	}
}
