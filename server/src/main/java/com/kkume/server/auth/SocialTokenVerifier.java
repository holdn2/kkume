package com.kkume.server.auth;

import com.kkume.server.user.Provider;

/**
 * 소셜 제공자가 발급한 토큰을 검증한다.
 *
 * <p>애플을 붙일 때 이 인터페이스에 구현을 하나 더하고 {@code provider} CHECK 제약에
 * {@code 'apple'} 을 더하는 마이그레이션만 쓰면 된다. 나머지 흐름은 그대로다.
 */
public interface SocialTokenVerifier {

	Provider provider();

	/**
	 * @throws InvalidSocialTokenException 서명 · 발급자 · 대상 · 만료 중 하나라도 어긋나면
	 */
	SocialIdentity verify(String token);
}
