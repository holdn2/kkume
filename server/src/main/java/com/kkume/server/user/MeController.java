package com.kkume.server.user;

import java.time.Instant;
import java.util.Map;
import java.util.UUID;

import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

/**
 * 로그인한 사용자 자신. 앱이 토큰이 아직 쓸 만한지 확인하는 데도 쓴다.
 */
@RestController
public class MeController {

	private final UserService users;

	public MeController(UserService users) {
		this.users = users;
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

	@ExceptionHandler(UserService.InvalidNicknameException.class)
	ResponseEntity<Map<String, String>> onInvalidNickname(UserService.InvalidNicknameException ex) {
		return ResponseEntity.badRequest().body(Map.of("code", "nickname_invalid", "message", ex.getMessage()));
	}

	public record RenameRequest(String nickname) {
	}

	public record MeResponse(String id, String nickname, String provider, Instant createdAt) {
	}
}
