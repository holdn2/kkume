package com.kkume.server.user;

import java.time.Instant;
import java.util.Map;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * 로그인한 사용자 자신. 앱이 토큰이 아직 쓸 만한지 확인하는 데도 쓴다.
 */
@RestController
public class MeController {

	private final UserService users;

	private final AccountDeletionService deletion;

	public MeController(UserService users, AccountDeletionService deletion) {
		this.users = users;
		this.deletion = deletion;
	}

	@GetMapping("/api/me")
	public MeResponse me(@AuthenticationPrincipal Jwt jwt) {
		User user = this.users.get(UUID.fromString(jwt.getSubject()));
		return view(user);
	}

	/** 이미 로그인한 사람이 다시 동의했다(문서 070 · 072). 같은 버전을 다시 보내도 같은 결과다 */
	@PutMapping("/api/me/consent")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	public void consent(@AuthenticationPrincipal Jwt jwt, @RequestBody(required = false) ConsentRequest request) {
		this.users.recordConsent(UUID.fromString(jwt.getSubject()), request == null ? null : request.version());
	}

	private static MeResponse view(User user) {
		return new MeResponse(user.getId().toString(), user.getNickname(), user.getProvider().code(),
				user.getCreatedAt(), user.getConsentVersion());
	}

	public record ConsentRequest(String version) {
	}

	@PatchMapping("/api/me")
	public MeResponse rename(@AuthenticationPrincipal Jwt jwt, @RequestBody(required = false) RenameRequest request) {
		User user = this.users.rename(UUID.fromString(jwt.getSubject()), request == null ? null : request.nickname());
		return view(user);
	}

	/**
	 * 계정 삭제(문서 064 · 066). 폰의 기록은 남고 서버의 기록은 지운다.
	 * 이미 지운 계정이면 토큰 단계에서 {@code 401 account_deleted}로 막힌다 — 앱은 그것을 성공으로 본다.
	 *
	 * <p>애플 계정은 본문에 {@code appleAuthorizationCode}(앱이 삭제 직전에 다시 받은 것)를 싣는다(문서 076).
	 * 구글 계정은 지금처럼 본문 없이 보낸다.
	 */
	@DeleteMapping("/api/me")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	public void delete(@AuthenticationPrincipal Jwt jwt, @RequestBody(required = false) DeleteRequest request) {
		this.deletion.deleteAccount(UUID.fromString(jwt.getSubject()),
				request == null ? null : request.appleAuthorizationCode());
	}

	public record DeleteRequest(String appleAuthorizationCode) {
	}

	@ExceptionHandler(AccountDeletionService.AppleReauthRequiredException.class)
	ResponseEntity<Map<String, String>> onAppleReauth(AccountDeletionService.AppleReauthRequiredException ex) {
		return ResponseEntity.badRequest().body(Map.of("code", "apple_reauth_required", "message", ex.getMessage()));
	}

	@ExceptionHandler(AccountDeletionService.AppleAccountMismatchException.class)
	ResponseEntity<Map<String, String>> onAppleMismatch(AccountDeletionService.AppleAccountMismatchException ex) {
		return ResponseEntity.badRequest().body(Map.of("code", "apple_account_mismatch", "message", ex.getMessage()));
	}

	@ExceptionHandler(AccountDeletionService.DeletionFailedException.class)
	ResponseEntity<Map<String, String>> onDeletionFailed(AccountDeletionService.DeletionFailedException ex) {
		return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
			.body(Map.of("code", "deletion_failed", "message", ex.getMessage()));
	}

	@ExceptionHandler(UserService.InvalidNicknameException.class)
	ResponseEntity<Map<String, String>> onInvalidNickname(UserService.InvalidNicknameException ex) {
		return ResponseEntity.badRequest().body(Map.of("code", "nickname_invalid", "message", ex.getMessage()));
	}

	public record RenameRequest(String nickname) {
	}

	public record MeResponse(String id, String nickname, String provider, Instant createdAt, String consentVersion) {
	}
}
