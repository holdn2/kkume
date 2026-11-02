package com.kkume.server.ratelimit;

import java.io.IOException;
import java.time.Clock;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import org.springframework.http.MediaType;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Component;
import org.springframework.util.AntPathMatcher;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * 요청 횟수 제한(문서 105 R4). 1분 칸마다 센다. 서버가 한 대라 메모리에 둔다 — 재시작하면 처음부터 센다.
 *
 * <p><b>Caddy 를 거친 요청만 센다.</b> 밖에는 443(Caddy)만 열려 있고, Caddy 는 들어온 {@code X-Forwarded-For}를
 * 버리고 실제 접속 IP 로 다시 적는다(신뢰하는 프록시를 정하지 않았으므로). 그래서 이 머리글이 없으면 서버 안
 * (배포 확인 · 테스트)에서 온 것이다. 앱 포트를 밖에 직접 열면 이 전제가 깨진다.
 *
 * <p>로그인한 요청은 사람별로, 아니면 IP 별로 센다. Spring Security 뒤에서 돌아 토큰은 이미 확인돼 있다.
 */
@Component
public class RateLimitFilter extends OncePerRequestFilter {

	/**
	 * @param method {@code null}이면 모든 방법
	 * @param needsQuery 이 이름의 쿼리가 있을 때만(검색)
	 */
	record Rule(String name, String method, String pattern, String needsQuery, int perMinute) {
	}

	/** 앞에서부터 맞는 것을 모두 센다. 맨 끝은 IP 하나의 전체 상한이다 */
	static final List<Rule> RULES = List.of(
			new Rule("auth", "POST", "/api/auth/**", null, 10),
			// 비로그인도 쓰고 꿈 내용을 순차로 훑는다(인덱스 없음)
			new Rule("search", "GET", "/api/community/posts", "q", 30),
			new Rule("post", "POST", "/api/community/posts", null, 5),
			new Rule("comment", "POST", "/api/community/posts/*/comments", null, 10),
			new Rule("like", "PUT", "/api/community/posts/*/like", null, 60),
			new Rule("report", "POST", "/api/community/reports", null, 10),
			new Rule("block", null, "/api/community/blocks/*", null, 30),
			new Rule("sync", "POST", "/api/sync/dreams", null, 30),
			new Rule("upload", "POST", "/api/dreams/*/audio/**", null, 30),
			new Rule("comic", "POST", "/api/comics", null, 10),
			new Rule("all", null, "/api/**", null, 300));

	/** 이보다 많이 쌓이면 지난 칸을 지운다. 넘쳐도 메모리가 끝없이 늘지 않게 */
	private static final int MAX_ENTRIES = 50_000;

	private final AntPathMatcher paths = new AntPathMatcher();

	private final Map<String, int[]> counts = new ConcurrentHashMap<>();

	private final Clock clock;

	public RateLimitFilter() {
		this(Clock.systemUTC());
	}

	RateLimitFilter(Clock clock) {
		this.clock = clock;
	}

	@Override
	protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
			throws ServletException, IOException {
		String ip = clientIp(request);
		if (ip == null) {
			chain.doFilter(request, response);
			return;
		}
		long minute = this.clock.millis() / 60_000;
		String who = who(ip);
		for (Rule rule : RULES) {
			if (matches(rule, request) && !take(rule.name() + "|" + (rule.name().equals("all") ? "ip:" + ip : who), minute,
					rule.perMinute())) {
				long retryAfter = 60 - (this.clock.millis() / 1000) % 60;
				response.setStatus(429);
				response.setHeader("Retry-After", Long.toString(retryAfter));
				response.setContentType(MediaType.APPLICATION_JSON_VALUE);
				response.setCharacterEncoding("UTF-8");
				response.getWriter().write("{\"code\":\"too_many_requests\",\"message\":\"요청이 너무 잦아요. 잠시 뒤 다시 해 주세요\"}");
				return;
			}
		}
		chain.doFilter(request, response);
	}

	private boolean matches(Rule rule, HttpServletRequest request) {
		return (rule.method() == null || rule.method().equals(request.getMethod()))
				&& this.paths.match(rule.pattern(), request.getRequestURI())
				&& (rule.needsQuery() == null || hasText(request.getParameter(rule.needsQuery())));
	}

	private boolean take(String key, long minute, int limit) {
		if (this.counts.size() > MAX_ENTRIES) {
			this.counts.values().removeIf(c -> c[0] != minute);
		}
		int[] slot = this.counts.compute(key, (k, c) -> {
			if (c == null || c[0] != minute) {
				return new int[] { (int) minute, 1 };
			}
			c[1]++;
			return c;
		});
		return slot[1] <= limit;
	}

	private static String who(String ip) {
		Authentication auth = SecurityContextHolder.getContext().getAuthentication();
		if (auth != null && auth.getPrincipal() instanceof Jwt jwt) {
			return "user:" + jwt.getSubject();
		}
		return "ip:" + ip;
	}

	/** Caddy 가 적은 접속 IP. 없으면 서버 안에서 온 것이다 */
	static String clientIp(HttpServletRequest request) {
		String forwarded = request.getHeader("X-Forwarded-For");
		if (!hasText(forwarded)) {
			return null;
		}
		int comma = forwarded.indexOf(',');
		return (comma < 0 ? forwarded : forwarded.substring(0, comma)).strip();
	}

	private static boolean hasText(String s) {
		return s != null && !s.isBlank();
	}
}
