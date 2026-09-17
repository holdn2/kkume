package com.kkume.server.job;

/**
 * 변환 실패. {@code code}는 앱이 {@code GET /stt}의 {@code error}로 받는 값이다.
 *
 * @see <a href="039 문서 03장">오류 코드</a>
 */
public class SttException extends RuntimeException {

	private final String code;

	private final boolean retryable;

	public SttException(String code, boolean retryable, String message) {
		super(message);
		this.code = code;
		this.retryable = retryable;
	}

	public String code() {
		return code;
	}

	/** 다시 해 봐야 소용없는 실패(말소리 없음 · 읽을 수 없는 파일)는 곧바로 failed 로 간다 */
	public boolean retryable() {
		return retryable;
	}
}
