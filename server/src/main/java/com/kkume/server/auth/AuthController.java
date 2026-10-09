package com.kkume.server.auth;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.kkume.server.user.User;
import com.kkume.server.user.UserService;

/**
 * 소셜 로그인.
 *
 * <p>앱이 구글 네이티브 로그인으로 받은 ID 토큰을 보내면, 검증한 뒤
 * <b>서버 자체 토큰</b>을 돌려준다. 이후 요청은 그 토큰만 쓴다.
 */
@RestController
@RequestMapping("/api/auth")
public class AuthController {

	private final GoogleTokenVerifier googleVerifier;

	private final AppleTokenVerifier appleVerifier;

	private final UserService users;

	private final AppTokenService tokens;

	public AuthController(GoogleTokenVerifier googleVerifier, AppleTokenVerifier appleVerifier, UserService users,
			AppTokenService tokens) {
		this.googleVerifier = googleVerifier;
		this.appleVerifier = appleVerifier;
		this.users = users;
		this.tokens = tokens;
	}

	@PostMapping("/google")
	public LoginResponse google(@RequestBody GoogleLoginRequest request) {
		if (request == null) {
			throw new InvalidSocialTokenException("본문이 비어 있습니다");
		}
		return login(this.googleVerifier, request.idToken(), request.consentVersion());
	}

	/**
	 * 애플 로그인(문서 075 · 076). 규칙 · 응답 · 오류는 구글과 모양까지 같다 — 앱이 같은 코드로 받는다.
	 * 애플 ID 토큰은 10분이라, 동의 시트를 그보다 오래 열어 두고 다시 보내면 {@code 401 invalid_token}이다.
	 */
	@PostMapping("/apple")
	public LoginResponse apple(@RequestBody AppleLoginRequest request) {
		if (request == null) {
			throw new InvalidSocialTokenException("본문이 비어 있습니다");
		}
		return login(this.appleVerifier, request.identityToken(), request.consentVersion());
	}

	/** 판정 순서: 동의 버전 모양(400) → 소셜 토큰(401) → 계정 없음 + 동의 없음(403 consent_required, {@code findOrCreate}) */
	private LoginResponse login(SocialTokenVerifier verifier, String socialToken, String consentVersion) {
		if (socialToken == null || socialToken.isBlank()) {
			throw new InvalidSocialTokenException("토큰이 비어 있습니다");
		}
		// 소셜 토큰보다 먼저 본다. 틀린 동의 버전으로는 계정을 만들지 않는다
		String consent = consentVersion == null ? null : UserService.requireConsentVersion(consentVersion);
		SocialIdentity identity = verifier.verify(socialToken);
		User user = this.users.findOrCreate(identity, consent);
		AppTokenService.IssuedToken token = this.tokens.issue(user.getId());
		return new LoginResponse(token.accessToken(), token.expiresInSeconds(),
				new LoginResponse.Me(user.getId().toString(), user.getNickname(), user.getConsentVersion()));
	}

	/**
	 * 왜 실패했는지는 돌려주지 않는다. "서명이 틀렸다" 와 "대상이 틀렸다" 를 구분해 주면
	 * 토큰을 맞춰 보는 쪽에 힌트가 된다.
	 */
	@ExceptionHandler(InvalidSocialTokenException.class)
	ResponseEntity<ErrorResponse> onInvalidToken(InvalidSocialTokenException ex) {
		return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
			.body(new ErrorResponse("invalid_token", "로그인에 실패했습니다"));
	}

	/**
	 * {@code consentVersion}: 동의 시트에서 동의한 버전. 없이 왔는데 꾸메 계정이 없으면 {@code 403 consent_required} —
	 * 앱은 시트를 띄우고 같은 {@code idToken}에 이 값을 붙여 다시 보낸다(문서 074)
	 */
	public record GoogleLoginRequest(String idToken, String consentVersion) {
	}

	/** {@code identityToken}: 애플이 준 ID 토큰(JWT). {@code consentVersion}은 구글과 같다 */
	public record AppleLoginRequest(String identityToken, String consentVersion) {
	}

	public record LoginResponse(String accessToken, long expiresIn, Me user) {

		/** {@code consentVersion}: 동의한 가장 새 버전. 없으면 {@code null} — 앱은 지금 버전과 같으면 다시 묻지 않는다 */
		public record Me(String id, String nickname, String consentVersion) {
		}
	}

	public record ErrorResponse(String code, String message) {
	}
}
