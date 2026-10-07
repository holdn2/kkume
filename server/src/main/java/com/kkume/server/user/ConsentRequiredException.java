package com.kkume.server.user;

/**
 * 꾸메 계정이 없는 소셜 계정이 동의 없이 로그인했다. 계정을 만들지 않고 {@code 403 consent_required}로 나간다(문서 074).
 *
 * <p>앱은 계정을 고른 뒤에 동의를 묻는다 — 먼저 동의 없이 로그인해 보고, 이걸 받으면 시트를 띄운 뒤
 * 같은 ID 토큰에 동의 버전을 붙여 다시 보낸다. 소셜 토큰을 검증한 뒤에만 던지므로
 * "이 계정은 꾸메 계정이 없다"는 사실은 토큰 주인에게만 나간다.
 */
public class ConsentRequiredException extends RuntimeException {

	public ConsentRequiredException() {
		super("가입하려면 이용약관과 개인정보 수집 · 이용에 동의해 주세요");
	}
}
