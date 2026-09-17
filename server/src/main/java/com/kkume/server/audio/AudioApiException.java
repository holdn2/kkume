package com.kkume.server.audio;

import org.springframework.http.HttpStatus;

/** 오디오 · 변환 엔드포인트가 돌려주는 오류. {@code code}는 계약(문서 039 03장)의 값이다 */
public class AudioApiException extends RuntimeException {

	private final HttpStatus status;

	private final String code;

	public AudioApiException(HttpStatus status, String code, String message) {
		super(message);
		this.status = status;
		this.code = code;
	}

	public HttpStatus status() {
		return status;
	}

	public String code() {
		return code;
	}
}
