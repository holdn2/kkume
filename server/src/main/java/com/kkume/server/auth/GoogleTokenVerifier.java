package com.kkume.server.auth;

import java.util.List;
import java.util.Set;

import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtException;

import com.kkume.server.user.Provider;

/**
 * 구글 ID 토큰을 검증한다.
 *
 * <p>서명 검증은 주입받은 {@link JwtDecoder} 가 구글 JWKS 로 하고,
 * <b>발급자와 대상 확인은 여기서 직접 한다.</b> 보안이 걸린 판단을 우리 코드에 두어야
 * 테스트로 확인할 수 있기 때문이다.
 */
public class GoogleTokenVerifier implements SocialTokenVerifier {

	/** 구글은 스킴이 붙은 것과 안 붙은 것을 모두 써 왔다. 둘 다 받는다. */
	static final Set<String> ISSUERS = Set.of("https://accounts.google.com", "accounts.google.com");

	private final JwtDecoder decoder;

	private final List<String> allowedClientIds;

	public GoogleTokenVerifier(JwtDecoder decoder, List<String> allowedClientIds) {
		if (allowedClientIds == null || allowedClientIds.isEmpty()) {
			// 비어 있으면 아무 구글 앱의 토큰이나 통과한다. 그 상태로 뜨게 두지 않는다.
			throw new IllegalArgumentException("kkume.auth.google.client-ids 가 비어 있습니다");
		}
		this.decoder = decoder;
		this.allowedClientIds = List.copyOf(allowedClientIds);
	}

	@Override
	public Provider provider() {
		return Provider.GOOGLE;
	}

	@Override
	public SocialIdentity verify(String token) {
		Jwt jwt;
		try {
			// 서명과 만료는 여기서 걸러진다
			jwt = this.decoder.decode(token);
		}
		catch (JwtException ex) {
			throw new InvalidSocialTokenException("구글 토큰을 해석하지 못했습니다", ex);
		}

		String issuer = jwt.getClaimAsString("iss");
		if (!ISSUERS.contains(issuer)) {
			throw new InvalidSocialTokenException("발급자가 구글이 아닙니다");
		}

		// aud 가 우리 client id 여야 한다. 이 확인을 빼면 다른 앱을 위해 발급된
		// 구글 토큰으로도 우리 서버에 로그인할 수 있다.
		List<String> audience = jwt.getAudience();
		if (audience == null || audience.stream().noneMatch(this.allowedClientIds::contains)) {
			throw new InvalidSocialTokenException("이 앱을 위해 발급된 토큰이 아닙니다");
		}

		String subject = jwt.getSubject();
		if (subject == null || subject.isBlank()) {
			throw new InvalidSocialTokenException("sub 가 없습니다");
		}

		return new SocialIdentity(Provider.GOOGLE, subject);
	}
}
