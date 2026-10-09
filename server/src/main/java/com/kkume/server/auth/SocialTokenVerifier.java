package com.kkume.server.auth;

import com.kkume.server.user.Provider;

/**
 * 소셜 제공자가 발급한 토큰을 검증한다.
 *
 * <p>구현은 구글({@link GoogleTokenVerifier})과 애플({@link AppleTokenVerifier}). 계정을 찾거나 만드는 규칙
 * (동의 · {@code consent_required})은 제공자와 무관하게 {@code UserService.findOrCreate} 하나다.
 */
public interface SocialTokenVerifier {

	Provider provider();

	/**
	 * @throws InvalidSocialTokenException 서명 · 발급자 · 대상 · 만료 중 하나라도 어긋나면
	 */
	SocialIdentity verify(String token);
}
