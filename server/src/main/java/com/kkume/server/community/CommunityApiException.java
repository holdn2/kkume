package com.kkume.server.community;

import java.util.Map;

import org.springframework.http.HttpStatus;

/**
 * 커뮤니티 엔드포인트가 돌려주는 오류. {@code code}는 계약(문서 056 03장)의 값이다.
 *
 * <p>{@code extra}는 본문 맨 위에 {@code code} · {@code message}와 나란히 붙는다 —
 * {@code 409 already_shared}의 {@code postId}가 그렇다. 앱은 오류 본문 전체를 {@code ApiError.data}로 받는다.
 */
public class CommunityApiException extends RuntimeException {

	private final HttpStatus status;

	private final String code;

	private final Map<String, Object> extra;

	public CommunityApiException(HttpStatus status, String code, String message) {
		this(status, code, message, Map.of());
	}

	public CommunityApiException(HttpStatus status, String code, String message, Map<String, Object> extra) {
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

	public Map<String, Object> extra() {
		return extra;
	}

	static CommunityApiException badRequest(String code, String message) {
		return new CommunityApiException(HttpStatus.BAD_REQUEST, code, message);
	}

	static CommunityApiException postNotFound() {
		return new CommunityApiException(HttpStatus.NOT_FOUND, "post_not_found", "글을 찾을 수 없습니다");
	}

	static CommunityApiException commentNotFound() {
		return new CommunityApiException(HttpStatus.NOT_FOUND, "comment_not_found", "댓글을 찾을 수 없습니다");
	}

	static CommunityApiException userNotFound() {
		return new CommunityApiException(HttpStatus.NOT_FOUND, "user_not_found", "사용자를 찾을 수 없습니다");
	}

	static CommunityApiException notOwner(String message) {
		return new CommunityApiException(HttpStatus.FORBIDDEN, "not_owner", message);
	}
}
