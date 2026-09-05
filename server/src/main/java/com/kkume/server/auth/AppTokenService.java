package com.kkume.server.auth;

import java.time.Duration;
import java.time.Instant;
import java.util.UUID;

import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.JwsHeader;
import org.springframework.security.oauth2.jwt.JwtClaimsSet;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtEncoderParameters;
import org.springframework.stereotype.Service;

/**
 * 서버가 앱에 주는 토큰을 발급한다.
 *
 * <p>구글 ID 토큰을 매 요청에 그대로 쓰지 않는 이유가 있다. 그 토큰은 한 시간이면
 * 만료되어 앱이 계속 구글에 재인증해야 하고, 애플이 들어오면 앱이 제공자마다 다른
 * 토큰을 다루게 된다. <b>서버가 자체 토큰을 주면 앱은 한 가지만 알면 된다.</b>
 */
@Service
public class AppTokenService {

	private final JwtEncoder encoder;

	private final Duration ttl;

	public AppTokenService(JwtEncoder encoder, AuthProperties properties) {
		this.encoder = encoder;
		this.ttl = properties.jwt().ttl();
	}

	public IssuedToken issue(UUID userId) {
		Instant now = Instant.now();
		JwtClaimsSet claims = JwtClaimsSet.builder()
			.issuer("kkume")
			.subject(userId.toString())
			.issuedAt(now)
			.expiresAt(now.plus(this.ttl))
			.build();
		// 알고리즘을 명시하지 않으면 RS256 으로 서명하려다 대칭키를 못 찾고
		// "Failed to select a JWK signing key" 로 죽는다.
		JwsHeader header = JwsHeader.with(MacAlgorithm.HS256).build();
		String value = this.encoder.encode(JwtEncoderParameters.from(header, claims)).getTokenValue();
		return new IssuedToken(value, this.ttl.toSeconds());
	}

	public record IssuedToken(String accessToken, long expiresInSeconds) {
	}
}
