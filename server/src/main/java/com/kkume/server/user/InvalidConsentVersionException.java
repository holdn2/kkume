package com.kkume.server.user;

/** 동의 버전이 {@code YYYY-MM-DD}가 아니다. 앱의 상수라 틀리면 앱 버그다 — 조용히 넘기지 않는다(문서 071) */
public class InvalidConsentVersionException extends RuntimeException {

	public InvalidConsentVersionException() {
		super("동의 버전이 올바르지 않습니다");
	}
}
