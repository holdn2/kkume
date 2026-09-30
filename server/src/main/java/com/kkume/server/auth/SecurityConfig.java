package com.kkume.server.auth;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.util.HexFormat;

import javax.crypto.SecretKey;
import javax.crypto.spec.SecretKeySpec;

import com.nimbusds.jose.jwk.source.ImmutableSecret;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.security.oauth2.jwt.NimbusJwtEncoder;
import org.springframework.security.oauth2.server.resource.web.BearerTokenAuthenticationEntryPoint;
import org.springframework.security.web.SecurityFilterChain;

/**
 * 인증 설정. 계획서가 "Spring Security 최소화"로 못 박은 구간이라 최소 구성으로 둔다.
 *
 * <p>세션을 만들지 않는다. 앱은 매 요청에 Bearer 토큰을 보내고 서버는 그것만 본다.
 */
@Configuration
@EnableConfigurationProperties(AuthProperties.class)
public class SecurityConfig {

	private static final Logger log = LoggerFactory.getLogger(SecurityConfig.class);

	/** HS256 의 최소 길이. 이보다 짧은 키는 서명을 약하게 만든다. */
	private static final int MIN_SECRET_BYTES = 32;

	@Bean
	SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
		return http
			// 브라우저 세션이 없으므로 CSRF 토큰이 지킬 대상도 없다
			.csrf(csrf -> csrf.disable())
			.sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
			.authorizeHttpRequests(auth -> auth
				// 로드밸런서와 배포 스크립트가 본다. 인증을 걸면 배포 확인이 막힌다
				.requestMatchers("/health", "/health/ready").permitAll()
				// 로그인 자체는 토큰이 없는 상태에서 부른다
				.requestMatchers("/api/auth/**").permitAll()
				// 커뮤니티 읽기는 로그인 없이 된다(문서 056 04장 6번). 쓰기와 "이 꿈으로 쓴 내 글"은 막는다.
				// 토큰을 보냈는데 만료됐으면 여기서도 401 이다 — 토큰 검사는 경로와 상관없이 "보냈으면 맞아야" 한다
				.requestMatchers(HttpMethod.GET, "/api/community/posts", "/api/community/posts/*",
						"/api/users/*/profile", "/api/users/*/posts").permitAll()
				.anyRequest().authenticated())
			.exceptionHandling(e -> e.authenticationEntryPoint(SecurityConfig::unauthorized))
			.oauth2ResourceServer(oauth2 -> oauth2.jwt(jwt -> {
			}).authenticationEntryPoint(SecurityConfig::unauthorized))
			.build();
	}

	private static final BearerTokenAuthenticationEntryPoint BEARER = new BearerTokenAuthenticationEntryPoint();

	/**
	 * 401 에 다른 오류와 같은 모양의 본문을 붙인다. 앱은 {@code code}로 가르는데, 본문이 비면
	 * {@code http_error}가 되어 "로그인이 필요함"과 "서버 오류"를 구분하지 못한다.
	 * 표준 {@code WWW-Authenticate} 헤더는 그대로 둔다.
	 */
	private static void unauthorized(HttpServletRequest request, HttpServletResponse response,
			AuthenticationException ex) throws IOException {
		BEARER.commence(request, response, ex);
		response.setContentType(MediaType.APPLICATION_JSON_VALUE);
		response.setCharacterEncoding(StandardCharsets.UTF_8.name());
		response.getWriter().write("{\"code\":\"unauthorized\",\"message\":\"로그인이 필요합니다\"}");
	}

	@Bean
	SecretKey appTokenKey(AuthProperties properties) {
		String configured = properties.jwt().secret();
		if (configured == null || configured.isBlank()) {
			// 저장소에 기본 키를 두지 않는다. 두면 그 값으로 누구나 토큰을 위조할 수 있다.
			// 대신 기동할 때마다 새로 만든다 — 재시작하면 로그인이 풀리는 것이 대가다.
			byte[] random = new byte[MIN_SECRET_BYTES];
			new SecureRandom().nextBytes(random);
			log.warn("kkume.auth.jwt.secret 이 없어 임시 키를 만들었습니다. "
					+ "재시작하면 발급한 토큰이 모두 무효가 됩니다. "
					+ "배포에서는 KKUME_JWT_SECRET 를 반드시 넣으세요. (예: openssl rand -hex 32)");
			return new SecretKeySpec(random, "HmacSHA256");
		}
		byte[] bytes = toKeyBytes(configured);
		if (bytes.length < MIN_SECRET_BYTES) {
			throw new IllegalStateException(
					"kkume.auth.jwt.secret 이 너무 짧습니다. 32바이트 이상이어야 합니다 (openssl rand -hex 32)");
		}
		return new SecretKeySpec(bytes, "HmacSHA256");
	}

	/** 16진수로 주면 그대로 바이트로 읽고, 아니면 문자열 바이트를 쓴다. */
	private static byte[] toKeyBytes(String configured) {
		try {
			return HexFormat.of().parseHex(configured);
		}
		catch (IllegalArgumentException ex) {
			return configured.getBytes(StandardCharsets.UTF_8);
		}
	}

	@Bean
	JwtEncoder jwtEncoder(SecretKey appTokenKey) {
		return new NimbusJwtEncoder(new ImmutableSecret<>(appTokenKey));
	}

	/**
	 * 우리가 발급한 토큰을 검증한다.
	 *
	 * <p>구글용 디코더는 <b>빈으로 두지 않는다.</b> {@code JwtDecoder} 빈이 둘이면
	 * 리소스 서버가 어느 것으로 Bearer 토큰을 검증할지 정하지 못한다.
	 */
	@Bean
	JwtDecoder jwtDecoder(SecretKey appTokenKey) {
		return NimbusJwtDecoder.withSecretKey(appTokenKey).macAlgorithm(MacAlgorithm.HS256).build();
	}

	@Bean
	GoogleTokenVerifier googleTokenVerifier(AuthProperties properties) {
		JwtDecoder googleDecoder = NimbusJwtDecoder
			.withJwkSetUri("https://www.googleapis.com/oauth2/v3/certs")
			.build();
		return new GoogleTokenVerifier(googleDecoder, properties.google().clientIds());
	}
}
