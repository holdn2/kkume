package com.kkume.server.auth;

import java.util.List;

import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtException;

import com.kkume.server.user.Provider;

/**
 * 애플 ID 토큰을 검증한다(문서 075 · 076). 구조는 {@link GoogleTokenVerifier}와 같다 —
 * 서명과 만료는 주입받은 디코더가 애플 JWKS 로, 발급자와 대상은 여기서 직접 본다.
 *
 * <p>네이티브 로그인이라 {@code aud}는 Services ID 가 아니라 앱의 번들 ID 다.
 * {@code nonce}는 보지 않는다 — 앱이 {@code 403 consent_required}를 받고 같은 토큰을 다시 보내는 흐름이라(074),
 * 재사용을 막으면 깨진다. 이메일 · 이름 클레임은 읽지 않는다.
 */
public class AppleTokenVerifier implements SocialTokenVerifier {

	static final String ISSUER = "https://appleid.apple.com";

	private final JwtDecoder decoder;

	private final List<String> allowedClientIds;

	public AppleTokenVerifier(JwtDecoder decoder, List<String> allowedClientIds) {
		if (allowedClientIds == null || allowedClientIds.isEmpty()) {
			// 비어 있으면 아무 앱을 위해 발급된 애플 토큰이나 통과한다
			throw new IllegalArgumentException("kkume.auth.apple.client-ids 가 비어 있습니다");
		}
		this.decoder = decoder;
		this.allowedClientIds = List.copyOf(allowedClientIds);
	}

	@Override
	public Provider provider() {
		return Provider.APPLE;
	}

	@Override
	public SocialIdentity verify(String token) {
		Jwt jwt;
		try {
			jwt = this.decoder.decode(token);
		}
		catch (JwtException ex) {
			throw new InvalidSocialTokenException("애플 토큰을 해석하지 못했습니다", ex);
		}

		if (!ISSUER.equals(jwt.getClaimAsString("iss"))) {
			throw new InvalidSocialTokenException("발급자가 애플이 아닙니다");
		}

		List<String> audience = jwt.getAudience();
		if (audience == null || audience.stream().noneMatch(this.allowedClientIds::contains)) {
			throw new InvalidSocialTokenException("이 앱을 위해 발급된 토큰이 아닙니다");
		}

		String subject = jwt.getSubject();
		if (subject == null || subject.isBlank()) {
			throw new InvalidSocialTokenException("sub 가 없습니다");
		}

		return new SocialIdentity(Provider.APPLE, subject);
	}
}
