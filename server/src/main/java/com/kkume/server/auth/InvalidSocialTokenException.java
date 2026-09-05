package com.kkume.server.auth;

/** 소셜 토큰이 검증을 통과하지 못했다. 왜 실패했는지는 응답에 담지 않는다. */
public class InvalidSocialTokenException extends RuntimeException {

	public InvalidSocialTokenException(String message, Throwable cause) {
		super(message, cause);
	}

	public InvalidSocialTokenException(String message) {
		super(message);
	}
}
