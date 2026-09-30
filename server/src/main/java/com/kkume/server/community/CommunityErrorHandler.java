package com.kkume.server.community;

import java.util.LinkedHashMap;
import java.util.Map;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

/** 커뮤니티 컨트롤러의 오류를 {@code { code, message, ...extra }}로 내보낸다 */
@RestControllerAdvice(basePackageClasses = CommunityErrorHandler.class)
class CommunityErrorHandler {

	@ExceptionHandler(CommunityApiException.class)
	ResponseEntity<Map<String, Object>> onError(CommunityApiException ex) {
		Map<String, Object> body = new LinkedHashMap<>();
		body.put("code", ex.code());
		body.put("message", ex.getMessage());
		body.putAll(ex.extra());
		return ResponseEntity.status(ex.status()).body(body);
	}
}
