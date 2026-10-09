package com.kkume.server.auth;

import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.interfaces.ECPublicKey;
import java.security.spec.ECGenParameterSpec;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Base64;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.crypto.ECDSAVerifier;
import com.nimbusds.jwt.SignedJWT;

import org.junit.jupiter.api.Test;

/**
 * 애플이 요구하는 client secret 모양 — ES256 · kid · iss=팀 ID · sub=번들 ID · aud=https://appleid.apple.com.
 * 애플의 {@code .p8}과 같은 P-256 PKCS#8 키를 만들어 서명하고 공개키로 확인한다.
 */
class AppleClientSecretTest {

	static KeyPair keyPair() throws Exception {
		KeyPairGenerator generator = KeyPairGenerator.getInstance("EC");
		generator.initialize(new ECGenParameterSpec("secp256r1"));
		return generator.generateKeyPair();
	}

	/** {@code .p8} 파일 내용과 같은 모양 */
	static String p8(KeyPair keys) {
		String base64 = Base64.getMimeEncoder(64, "\n".getBytes()).encodeToString(keys.getPrivate().getEncoded());
		return "-----BEGIN PRIVATE KEY-----\n" + base64 + "\n-----END PRIVATE KEY-----\n";
	}

	private static final Instant NOW = Instant.parse("2026-10-09T10:00:00Z");

	@Test
	void ES256으로_서명하고_애플이_요구하는_클레임을_담는다() throws Exception {
		KeyPair keys = keyPair();
		AppleClientSecret secret = new AppleClientSecret("3PW3FZG3GR", "com.holdn2.kkume", "ABC123DEFG", p8(keys),
				Clock.fixed(NOW, ZoneOffset.UTC));

		SignedJWT jwt = SignedJWT.parse(secret.create());

		assertThat(jwt.verify(new ECDSAVerifier((ECPublicKey) keys.getPublic()))).isTrue();
		assertThat(jwt.getHeader().getAlgorithm()).isEqualTo(JWSAlgorithm.ES256);
		assertThat(jwt.getHeader().getKeyID()).isEqualTo("ABC123DEFG");
		assertThat(jwt.getJWTClaimsSet().getIssuer()).isEqualTo("3PW3FZG3GR");
		assertThat(jwt.getJWTClaimsSet().getSubject()).isEqualTo("com.holdn2.kkume");
		assertThat(jwt.getJWTClaimsSet().getAudience()).isEqualTo(List.of("https://appleid.apple.com"));
		assertThat(jwt.getJWTClaimsSet().getIssueTime().toInstant()).isEqualTo(NOW);
		// 애플 상한은 6개월. 요청마다 새로 만드니 짧게
		assertThat(jwt.getJWTClaimsSet().getExpirationTime().toInstant()).isEqualTo(NOW.plusSeconds(300));
	}

	@Test
	void 머리줄_없는_base64_한_줄도_받는다() throws Exception {
		KeyPair keys = keyPair();
		String oneLine = Base64.getEncoder().encodeToString(keys.getPrivate().getEncoded());
		AppleClientSecret secret = new AppleClientSecret("T", "C", "K", oneLine, Clock.systemUTC());

		assertThat(SignedJWT.parse(secret.create()).verify(new ECDSAVerifier((ECPublicKey) keys.getPublic()))).isTrue();
	}

	@Test
	void 키가_아니면_기동하지_않고_메시지에_키_내용을_넣지_않는다() {
		assertThatThrownBy(() -> new AppleClientSecret("T", "C", "K", "not-a-key-SECRETSTUFF", Clock.systemUTC()))
			.isInstanceOf(IllegalArgumentException.class)
			.message().doesNotContain("SECRETSTUFF");
	}
}
