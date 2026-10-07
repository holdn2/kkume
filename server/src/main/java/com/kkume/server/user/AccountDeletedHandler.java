package com.kkume.server.user;

import java.util.Map;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

/**
 * 어느 컨트롤러에서 나오든 {@link AccountDeletedException}은 같은 모양이다.
 * 토큰 단계에서 막힌 것({@code SecurityConfig})과 쓰기 도중에 막힌 것을 앱이 구분하지 않아도 되게 한다.
 */
@RestControllerAdvice
class AccountDeletedHandler {

	@ExceptionHandler(AccountSuspendedException.class)
	ResponseEntity<Map<String, String>> onSuspended(AccountSuspendedException ex) {
		return ResponseEntity.status(HttpStatus.FORBIDDEN)
			.body(Map.of("code", "account_suspended", "message", ex.getMessage()));
	}

	@ExceptionHandler(InvalidConsentVersionException.class)
	ResponseEntity<Map<String, String>> onInvalidConsent(InvalidConsentVersionException ex) {
		return ResponseEntity.badRequest().body(Map.of("code", "invalid_consent_version", "message", ex.getMessage()));
	}

	@ExceptionHandler(AccountDeletedException.class)
	ResponseEntity<Map<String, String>> onDeleted(AccountDeletedException ex) {
		return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
			.body(Map.of("code", "account_deleted", "message", ex.getMessage()));
	}
}
