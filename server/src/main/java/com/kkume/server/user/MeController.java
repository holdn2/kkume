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
		return new MeResponse(user.getId().toString(), user.getNickname(),
				user.getProvider().code(), user.getCreatedAt());
	}

	@PatchMapping("/api/me")
	public MeResponse rename(@AuthenticationPrincipal Jwt jwt, @RequestBody(required = false) RenameRequest request) {
		User user = this.users.rename(UUID.fromString(jwt.getSubject()), request == null ? null : request.nickname());
		return new MeResponse(user.getId().toString(), user.getNickname(),
				user.getProvider().code(), user.getCreatedAt());
	}

	/**
	 * 계정 삭제(문서 064 · 066). 폰의 기록은 남고 서버의 기록은 지운다.
	 * 이미 지운 계정이면 토큰 단계에서 {@code 401 account_deleted}로 막힌다 — 앱은 그것을 성공으로 본다.
	 */
	@DeleteMapping("/api/me")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	public void delete(@AuthenticationPrincipal Jwt jwt) {
		this.deletion.delete(UUID.fromString(jwt.getSubject()));
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

	public record MeResponse(String id, String nickname, String provider, Instant createdAt) {
	}
}
