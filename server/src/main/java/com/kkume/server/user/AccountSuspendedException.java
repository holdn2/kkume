package com.kkume.server.user;

/**
 * 이용이 제한된 계정의 글 · 댓글 · 공감 · 닉네임 바꾸기. {@code 403 account_suspended}로 나간다(문서 070 · 072).
 *
 * <p>신고 · 차단 · 읽기 · 내 꿈 동기화 · 동의 기록 · 계정 삭제는 막지 않는다 — 비공개 꿈 기록은 커뮤니티 위반과 무관하다.
 */
public class AccountSuspendedException extends RuntimeException {

	public AccountSuspendedException(String contact) {
		super("이용이 제한된 계정입니다. 문의: " + contact);
	}
}
