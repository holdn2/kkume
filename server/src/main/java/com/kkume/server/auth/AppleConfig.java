package com.kkume.server.auth;

import java.time.Clock;
import java.time.Duration;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.web.client.RestClient;

/**
 * 애플 로그인 검증기와 회수 클라이언트(문서 075 · 076).
 *
 * <p>검증기의 디코더는 빈으로 두지 않는다 — {@code JwtDecoder} 빈이 둘이면 리소스 서버가 우리 토큰을 무엇으로 검증할지
 * 정하지 못한다({@link SecurityConfig}의 구글과 같은 이유).
 */
@Configuration
class AppleConfig {

	private static final Logger log = LoggerFactory.getLogger(AppleConfig.class);

	@Bean
	AppleTokenVerifier appleTokenVerifier(AuthProperties properties) {
		JwtDecoder decoder = NimbusJwtDecoder.withJwkSetUri("https://appleid.apple.com/auth/keys").build();
		return new AppleTokenVerifier(decoder, properties.apple().clientIds());
	}

	@Bean
	AppleAccountClient appleAccountClient(AuthProperties properties, AppleTokenVerifier verifier) {
		AuthProperties.Apple apple = properties.apple();
		if (!apple.canRevoke()) {
			log.warn("애플 회수용 키(KKUME_APPLE_KEY_ID · KKUME_APPLE_PRIVATE_KEY)가 없다 — 애플 로그인은 되지만 "
					+ "계정 삭제 때 애플 토큰 회수를 건너뛴다. App Store 제출 전에 넣어야 한다(5.1.1(v))");
			return new Disabled();
		}
		String clientId = apple.clientIds().get(0);
		SimpleClientHttpRequestFactory timeouts = new SimpleClientHttpRequestFactory();
		timeouts.setConnectTimeout(Duration.ofSeconds(5));
		timeouts.setReadTimeout(Duration.ofSeconds(10));
		return new RestAppleAccountClient(RestClient.builder().requestFactory(timeouts),
				new AppleClientSecret(apple.teamId(), clientId, apple.keyId(), apple.privateKey(), Clock.systemUTC()),
				clientId, verifier);
	}

	/** 키가 없을 때. 교환 · 회수를 하지 않는다 */
	static class Disabled implements AppleAccountClient {

		@Override
		public boolean enabled() {
			return false;
		}

		@Override
		public AppleGrant exchange(String authorizationCode) {
			throw new IllegalStateException("애플 회수용 키가 없습니다");
		}

		@Override
		public void revoke(AppleGrant grant) {
		}
	}
}
