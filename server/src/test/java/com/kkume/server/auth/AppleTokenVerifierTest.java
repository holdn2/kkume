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
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtEncoderParameters;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.security.oauth2.jwt.NimbusJwtEncoder;

import com.kkume.server.user.Provider;

/**
 * 애플 서명 대신 로컬 키로 서명한 토큰을 쓴다({@link GoogleTokenVerifierTest}와 같은 이유) — 확인하려는 것은
 * 우리가 거부해야 할 토큰을 실제로 거부하는가다.
 */
class AppleTokenVerifierTest {

	static final String BUNDLE_ID = "com.holdn2.kkume";

	static final SecretKey KEY = new SecretKeySpec("apple-test-key-long-enough-32byt".getBytes(), "HmacSHA256");

	private static final JwsHeader HS256 = JwsHeader.with(MacAlgorithm.HS256).build();

	private static final JwtEncoder ENCODER = new NimbusJwtEncoder(new ImmutableSecret<>(KEY));

	static AppleTokenVerifier verifier() {
		return new AppleTokenVerifier(NimbusJwtDecoder.withSecretKey(KEY).macAlgorithm(MacAlgorithm.HS256).build(),
				List.of(BUNDLE_ID));
	}

	static String token(String issuer, String audience, String subject, Instant expiresAt) {
		JwtClaimsSet.Builder claims = JwtClaimsSet.builder().issuedAt(expiresAt.minusSeconds(600)).expiresAt(expiresAt);
		if (issuer != null) {
			claims.issuer(issuer);
		}
		if (audience != null) {
			claims.audience(List.of(audience));
		}
		if (subject != null) {
			claims.subject(subject);
		}
		return ENCODER.encode(JwtEncoderParameters.from(HS256, claims.build())).getTokenValue();
	}

	static String validToken(String subject) {
		return token("https://appleid.apple.com", BUNDLE_ID, subject, Instant.now().plus(10, ChronoUnit.MINUTES));
	}

	private final AppleTokenVerifier verifier = verifier();

	@Test
	void 제대로_된_토큰은_애플_신원을_돌려준다() {
		SocialIdentity identity = this.verifier.verify(validToken("001234.abcd.0102"));

		assertThat(identity.provider()).isEqualTo(Provider.APPLE);
		assertThat(identity.providerId()).isEqualTo("001234.abcd.0102");
	}

	@Test
	void 같은_토큰을_만료_전에_다시_보내도_검증된다() {
		// 403 consent_required 뒤 같은 토큰을 다시 보내는 흐름(074) — nonce 를 보지 않는다
		String token = validToken("001234.abcd.0102");
		this.verifier.verify(token);

		assertThat(this.verifier.verify(token).providerId()).isEqualTo("001234.abcd.0102");
	}

	@Test
	void 다른_앱의_토큰은_거부한다() {
		String other = token("https://appleid.apple.com", "com.someone.else", "s", Instant.now().plusSeconds(600));

		assertThatThrownBy(() -> this.verifier.verify(other)).isInstanceOf(InvalidSocialTokenException.class);
	}

	@Test
	void 발급자가_애플이_아니면_거부한다() {
		String forged = token("https://evil.example", BUNDLE_ID, "s", Instant.now().plusSeconds(600));

		assertThatThrownBy(() -> this.verifier.verify(forged)).isInstanceOf(InvalidSocialTokenException.class);
	}

	@Test
	void 만료된_토큰은_거부한다() {
		String expired = token("https://appleid.apple.com", BUNDLE_ID, "s", Instant.now().minus(5, ChronoUnit.MINUTES));

		assertThatThrownBy(() -> this.verifier.verify(expired)).isInstanceOf(InvalidSocialTokenException.class);
	}

	@Test
	void sub가_없으면_거부한다() {
		String noSub = token("https://appleid.apple.com", BUNDLE_ID, null, Instant.now().plusSeconds(600));

		assertThatThrownBy(() -> this.verifier.verify(noSub)).isInstanceOf(InvalidSocialTokenException.class);
	}

	@Test
	void 허용_목록이_비면_기동하지_않는다() {
		assertThatThrownBy(() -> new AppleTokenVerifier(
				NimbusJwtDecoder.withSecretKey(KEY).macAlgorithm(MacAlgorithm.HS256).build(), List.of()))
			.isInstanceOf(IllegalArgumentException.class);
	}
}
