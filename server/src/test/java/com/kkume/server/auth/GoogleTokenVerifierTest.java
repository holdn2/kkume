package com.kkume.server.auth;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;

import javax.crypto.SecretKey;
import javax.crypto.spec.SecretKeySpec;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.nimbusds.jose.jwk.source.ImmutableSecret;

import org.junit.jupiter.api.Test;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.JwsHeader;
import org.springframework.security.oauth2.jwt.JwtClaimsSet;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtEncoderParameters;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.security.oauth2.jwt.NimbusJwtEncoder;

import com.kkume.server.user.Provider;

/**
 * 구글 서명 대신 로컬 키로 서명한 토큰을 쓴다.
 *
 * <p>확인하려는 것은 구글의 서명 알고리즘이 아니라 <b>우리가 거부해야 할 토큰을
 * 실제로 거부하는가</b>다. 서명 검증은 Spring Security 가 하고, 발급자·대상·sub 확인이
 * 우리 코드다.
 */
class GoogleTokenVerifierTest {

	private static final String OUR_CLIENT_ID = "111-ours.apps.googleusercontent.com";

	private static final SecretKey KEY =
			new SecretKeySpec("test-key-that-is-long-enough-32b".getBytes(), "HmacSHA256");

	/** 헤더를 안 주면 RS256 으로 서명하려다 대칭키를 못 찾는다. */
	private static final JwsHeader HS256 = JwsHeader.with(MacAlgorithm.HS256).build();

	private final JwtEncoder encoder = new NimbusJwtEncoder(new ImmutableSecret<>(KEY));

	private final JwtDecoder decoder =
			NimbusJwtDecoder.withSecretKey(KEY).macAlgorithm(MacAlgorithm.HS256).build();

	private final GoogleTokenVerifier verifier =
			new GoogleTokenVerifier(this.decoder, List.of(OUR_CLIENT_ID));

	private String token(String issuer, List<String> audience, String subject, Instant expiresAt) {
		// issuedAt 은 expiresAt 보다 앞이어야 한다. 만료된 토큰을 만들 때도 마찬가지라
		// 현재 시각이 아니라 만료 시각을 기준으로 잡는다.
		JwtClaimsSet.Builder claims = JwtClaimsSet.builder()
			.issuedAt(expiresAt.minusSeconds(600))
			.expiresAt(expiresAt);
		if (issuer != null) {
			claims.issuer(issuer);
		}
		if (audience != null) {
			claims.audience(audience);
		}
		if (subject != null) {
			claims.subject(subject);
		}
		return this.encoder.encode(JwtEncoderParameters.from(HS256, claims.build())).getTokenValue();
	}

	private String validToken() {
		return token("https://accounts.google.com", List.of(OUR_CLIENT_ID), "google-sub-1",
				Instant.now().plus(1, ChronoUnit.HOURS));
	}

	@Test
	void 제대로_된_토큰은_신원을_돌려준다() {
		SocialIdentity identity = this.verifier.verify(validToken());

		assertThat(identity.provider()).isEqualTo(Provider.GOOGLE);
		assertThat(identity.providerId()).isEqualTo("google-sub-1");
	}

	@Test
	void 같은_토큰을_만료_전에_다시_보내도_검증된다() {
		// 앱은 403 consent_required 를 받으면 같은 ID 토큰에 동의를 붙여 다시 보낸다(문서 074).
		// 재사용 막기(nonce · jti)를 넣으면 이 흐름이 깨진다
		String token = validToken();
		this.verifier.verify(token);

		assertThat(this.verifier.verify(token).providerId()).isEqualTo("google-sub-1");
	}

	@Test
	void 다른_앱을_위해_발급된_토큰은_거부한다() {
		String other = token("https://accounts.google.com",
				List.of("999-someone-else.apps.googleusercontent.com"), "google-sub-1",
				Instant.now().plus(1, ChronoUnit.HOURS));

		// 이 확인이 빠지면 아무 구글 앱의 토큰으로도 우리 서버에 로그인할 수 있다
		assertThatThrownBy(() -> this.verifier.verify(other))
			.isInstanceOf(InvalidSocialTokenException.class);
	}

	@Test
	void 발급자가_구글이_아니면_거부한다() {
		String forged = token("https://evil.example", List.of(OUR_CLIENT_ID), "google-sub-1",
				Instant.now().plus(1, ChronoUnit.HOURS));

		assertThatThrownBy(() -> this.verifier.verify(forged))
			.isInstanceOf(InvalidSocialTokenException.class);
	}

	@Test
	void 만료된_토큰은_거부한다() {
		String expired = token("https://accounts.google.com", List.of(OUR_CLIENT_ID), "google-sub-1",
				Instant.now().minusSeconds(60));

		assertThatThrownBy(() -> this.verifier.verify(expired))
			.isInstanceOf(InvalidSocialTokenException.class);
	}

	@Test
	void 서명이_다른_키면_거부한다() {
		SecretKey otherKey =
				new SecretKeySpec("another-key-that-is-long-enough1".getBytes(), "HmacSHA256");
		JwtEncoder otherEncoder = new NimbusJwtEncoder(new ImmutableSecret<>(otherKey));
		String signedElsewhere = otherEncoder.encode(JwtEncoderParameters.from(HS256, JwtClaimsSet.builder()
			.issuer("https://accounts.google.com")
			.audience(List.of(OUR_CLIENT_ID))
			.subject("google-sub-1")
			.issuedAt(Instant.now())
			.expiresAt(Instant.now().plus(1, ChronoUnit.HOURS))
			.build())).getTokenValue();

		assertThatThrownBy(() -> this.verifier.verify(signedElsewhere))
			.isInstanceOf(InvalidSocialTokenException.class);
	}

	@Test
	void sub가_없으면_거부한다() {
		String noSub = token("https://accounts.google.com", List.of(OUR_CLIENT_ID), null,
				Instant.now().plus(1, ChronoUnit.HOURS));

		assertThatThrownBy(() -> this.verifier.verify(noSub))
			.isInstanceOf(InvalidSocialTokenException.class);
	}

	@Test
	void client_id가_비어_있으면_아예_만들어지지_않는다() {
		// 비어 있으면 대상 확인이 무력해진다. 그 상태로 뜨게 두지 않는다.
		assertThatThrownBy(() -> new GoogleTokenVerifier(this.decoder, List.of()))
			.isInstanceOf(IllegalArgumentException.class);
	}
}
