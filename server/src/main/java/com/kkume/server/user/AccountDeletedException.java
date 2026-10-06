package com.kkume.server.user;

/**
 * 지운 계정으로 들어온 쓰기. {@code 401 account_deleted}로 나간다(문서 064 · 066).
 *
 * <p>앱은 이것을 받으면 로그아웃과 같은 정리를 하고, 계정 삭제를 다시 누른 경우에는 성공으로 마무리한다.
 */
public class AccountDeletedException extends RuntimeException {

	public AccountDeletedException() {
		super("삭제된 계정입니다");
	}
}
