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

	private final UserService users;

	private final AppTokenService tokens;

	public AuthController(GoogleTokenVerifier googleVerifier, UserService users, AppTokenService tokens) {
		this.googleVerifier = googleVerifier;
		this.users = users;
		this.tokens = tokens;
	}

	@PostMapping("/google")
	public LoginResponse google(@RequestBody GoogleLoginRequest request) {
		if (request == null || request.idToken() == null || request.idToken().isBlank()) {
			throw new InvalidSocialTokenException("idToken 이 비어 있습니다");
		}
		// 구글 토큰보다 먼저 본다. 틀린 동의 버전으로는 계정을 만들지 않는다
		String consent = request.consentVersion() == null ? null : UserService.requireConsentVersion(request.consentVersion());
		SocialIdentity identity = this.googleVerifier.verify(request.idToken());
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

	/** {@code consentVersion}: 로그인 전 동의 시트에서 동의한 버전. 옛 앱은 보내지 않는다 */
	public record GoogleLoginRequest(String idToken, String consentVersion) {
	}

	public record LoginResponse(String accessToken, long expiresIn, Me user) {

		/** {@code consentVersion}: 동의한 가장 새 버전. 없으면 {@code null} — 앱은 지금 버전과 같으면 다시 묻지 않는다 */
		public record Me(String id, String nickname, String consentVersion) {
		}
	}

	public record ErrorResponse(String code, String message) {
	}
}
