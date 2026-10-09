package com.kkume.server.auth;

import java.security.KeyFactory;
import java.security.interfaces.ECPrivateKey;
import java.security.spec.PKCS8EncodedKeySpec;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.Date;

import com.nimbusds.jose.JOSEException;
import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.JWSHeader;
import com.nimbusds.jose.crypto.ECDSASigner;
import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.SignedJWT;

/**
 * 애플 토큰 엔드포인트에 내는 client secret — 우리 {@code .p8} 키로 서명한 ES256 JWT.
 *
 * <p>애플은 최대 6개월짜리를 허용하지만 요청마다 5분짜리를 새로 만든다. 새어도 곧 쓸모없고, 갱신을 잊을 일이 없다.
 */
public class AppleClientSecret {

	static final String AUDIENCE = "https://appleid.apple.com";

	static final Duration LIFETIME = Duration.ofMinutes(5);

	private final String teamId;

	private final String clientId;

	private final String keyId;

	private final ECDSASigner signer;

	private final Clock clock;

	public AppleClientSecret(String teamId, String clientId, String keyId, String privateKey, Clock clock) {
		this.teamId = teamId;
		this.clientId = clientId;
		this.keyId = keyId;
		this.clock = clock;
		try {
			this.signer = new ECDSASigner(parse(privateKey));
		}
		catch (JOSEException | IllegalArgumentException ex) {
			// 키 내용은 메시지에 넣지 않는다
			throw new IllegalArgumentException("kkume.auth.apple.private-key 를 읽지 못했습니다(.p8 내용인지 확인)", ex);
		}
	}

	public String create() {
		Instant now = this.clock.instant();
		JWTClaimsSet claims = new JWTClaimsSet.Builder()
			.issuer(this.teamId)
			.subject(this.clientId)
			.audience(AUDIENCE)
			.issueTime(Date.from(now))
			.expirationTime(Date.from(now.plus(LIFETIME)))
			.build();
		SignedJWT jwt = new SignedJWT(new JWSHeader.Builder(JWSAlgorithm.ES256).keyID(this.keyId).build(), claims);
		try {
			jwt.sign(this.signer);
		}
		catch (JOSEException ex) {
			throw new IllegalStateException("애플 client secret 서명 실패", ex);
		}
		return jwt.serialize();
	}

	/** PEM 그대로든, 머리줄 없이 base64 만이든 받는다. 환경변수 한 줄로 넘기기 쉬운 쪽은 뒤의 것이다 */
	static ECPrivateKey parse(String privateKey) {
		String base64 = privateKey.replaceAll("-----[A-Z ]+-----", "").replaceAll("\\s", "");
		try {
			byte[] der = Base64.getDecoder().decode(base64);
			return (ECPrivateKey) KeyFactory.getInstance("EC").generatePrivate(new PKCS8EncodedKeySpec(der));
		}
		catch (java.security.GeneralSecurityException | ClassCastException ex) {
			throw new IllegalArgumentException("EC PKCS#8 키가 아닙니다", ex);
		}
	}
}
