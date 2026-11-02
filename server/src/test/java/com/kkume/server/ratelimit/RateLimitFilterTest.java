package com.kkume.server.ratelimit;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;

/** 요청 횟수 제한(문서 105 R4) */
class RateLimitFilterTest {

	private final AtomicReference<Instant> now = new AtomicReference<>(Instant.parse("2026-11-02T10:00:05Z"));

	private final RateLimitFilter filter = new RateLimitFilter(new Clock() {
		@Override
		public Instant instant() {
			return RateLimitFilterTest.this.now.get();
		}

		@Override
		public java.time.ZoneId getZone() {
			return ZoneOffset.UTC;
		}

		@Override
		public Clock withZone(java.time.ZoneId zone) {
			return this;
		}
	});

	@AfterEach
	void clear() {
		SecurityContextHolder.clearContext();
	}

	private int send(String method, String uri, String ip, String query) throws Exception {
		MockHttpServletRequest request = new MockHttpServletRequest(method, uri);
		if (ip != null) {
			request.addHeader("X-Forwarded-For", ip);
		}
		if (query != null) {
			request.setParameter("q", query);
		}
		MockHttpServletResponse response = new MockHttpServletResponse();
		this.filter.doFilter(request, response, new MockFilterChain());
		return response.getStatus();
	}

	private void as(String userId) {
		Jwt jwt = Jwt.withTokenValue("t").header("alg", "HS256").subject(userId).build();
		SecurityContextHolder.getContext().setAuthentication(new JwtAuthenticationToken(jwt));
	}

	@Test
	void 로그인은_IP_하나에_1분_10번이고_다음_1분이면_풀린다() throws Exception {
		for (int i = 0; i < 10; i++) {
			assertThat(send("POST", "/api/auth/google", "1.2.3.4", null)).isEqualTo(200);
		}
		assertThat(send("POST", "/api/auth/google", "1.2.3.4", null)).isEqualTo(429);
		// 다른 IP 는 따로 센다
		assertThat(send("POST", "/api/auth/google", "5.6.7.8", null)).isEqualTo(200);

		this.now.set(this.now.get().plusSeconds(60));
		assertThat(send("POST", "/api/auth/google", "1.2.3.4", null)).isEqualTo(200);
	}

	@Test
	void 거절하면_429_와_Retry_After_와_해요체_문구를_준다() throws Exception {
		for (int i = 0; i < 10; i++) {
			send("POST", "/api/auth/apple", "9.9.9.9", null);
		}
		MockHttpServletRequest request = new MockHttpServletRequest("POST", "/api/auth/apple");
		request.addHeader("X-Forwarded-For", "9.9.9.9");
		MockHttpServletResponse response = new MockHttpServletResponse();
		this.filter.doFilter(request, response, new MockFilterChain());

		assertThat(response.getStatus()).isEqualTo(429);
		assertThat(response.getHeader("Retry-After")).isEqualTo("55");
		assertThat(response.getContentAsString()).contains("\"code\":\"too_many_requests\"", "잠시 뒤 다시 해 주세요");
	}

	@Test
	void 검색은_q_가_있을_때만_센다() throws Exception {
		for (int i = 0; i < 30; i++) {
			assertThat(send("GET", "/api/community/posts", "1.1.1.1", "고래")).isEqualTo(200);
		}
		assertThat(send("GET", "/api/community/posts", "1.1.1.1", "고래")).isEqualTo(429);
		// 검색어 없는 피드는 전체 상한(300)만 본다
		assertThat(send("GET", "/api/community/posts", "1.1.1.1", null)).isEqualTo(200);
	}

	@Test
	void 로그인한_쓰기는_사람별로_센다_같은_IP_여도_따로다() throws Exception {
		as("user-a");
		for (int i = 0; i < 10; i++) {
			assertThat(send("POST", "/api/community/posts/p1/comments", "2.2.2.2", null)).isEqualTo(200);
		}
		assertThat(send("POST", "/api/community/posts/p2/comments", "2.2.2.2", null)).isEqualTo(429);

		as("user-b");
		assertThat(send("POST", "/api/community/posts/p1/comments", "2.2.2.2", null)).isEqualTo(200);
	}

	@Test
	void Caddy_를_거치지_않은_요청은_세지_않는다() throws Exception {
		for (int i = 0; i < 20; i++) {
			assertThat(send("POST", "/api/auth/google", null, null)).isEqualTo(200);
		}
	}

	@Test
	void 앞에_붙은_IP_가_접속한_곳이다() {
		MockHttpServletRequest request = new MockHttpServletRequest();
		request.addHeader("X-Forwarded-For", "3.3.3.3, 10.0.0.1");
		assertThat(RateLimitFilter.clientIp(request)).isEqualTo("3.3.3.3");
	}
}
