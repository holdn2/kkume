package com.kkume.server.comic;

import java.util.LinkedHashMap;
import java.util.Map;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

/**
 * 만화 엔드포인트의 오류. {@code code}는 계약(문서 081 01장)의 값이고, 문구는 앱이 그대로 보여 준다.
 *
 * <p>{@code extra}는 본문 맨 위에 {@code code} · {@code message}와 나란히 붙는다 — {@code 409}의 {@code comicId},
 * {@code 429}의 {@code resetAt}이 그렇다.
 */
public class ComicApiException extends RuntimeException {

	private final HttpStatus status;

	private final String code;

	private final transient Map<String, Object> extra;

	public ComicApiException(HttpStatus status, String code, String message) {
		this(status, code, message, Map.of());
	}

	public ComicApiException(HttpStatus status, String code, String message, Map<String, Object> extra) {
		super(message);
		this.status = status;
		this.code = code;
		this.extra = extra;
	}

	public HttpStatus status() {
		return status;
	}

	public String code() {
		return code;
	}

	static ComicApiException invalidInput() {
		return new ComicApiException(HttpStatus.BAD_REQUEST, "invalid_comic_input", "만화로 만들 꿈 내용을 확인해 주세요");
	}

	static ComicApiException notFound() {
		return new ComicApiException(HttpStatus.NOT_FOUND, "comic_not_found", "만화를 찾을 수 없습니다");
	}

	static ComicApiException unavailable() {
		return new ComicApiException(HttpStatus.SERVICE_UNAVAILABLE, "comic_unavailable", "지금은 만화를 만들 수 없어요");
	}

	static ComicApiException budgetExhausted() {
		return new ComicApiException(HttpStatus.SERVICE_UNAVAILABLE, "comic_budget_exhausted",
				"오늘 만화가 마감됐어요. 내일 다시 만들어 주세요");
	}

	/** 커뮤니티 글 상세가 그림 주소를 만들다 던져도 이 모양으로 나가게 패키지를 가리지 않는다 */
	@RestControllerAdvice
	static class Handler {

		@ExceptionHandler(ComicApiException.class)
		ResponseEntity<Map<String, Object>> onError(ComicApiException ex) {
			Map<String, Object> body = new LinkedHashMap<>();
			body.put("code", ex.code());
			body.put("message", ex.getMessage());
			body.putAll(ex.extra);
			return ResponseEntity.status(ex.status()).body(body);
		}
	}
}
