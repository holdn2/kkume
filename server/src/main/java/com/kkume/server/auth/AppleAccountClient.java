package com.kkume.server.auth;

/**
 * 계정 삭제 때 애플 토큰 회수(App Store 5.1.1(v), 문서 075 · 076).
 *
 * <p>서버는 애플 토큰을 보관하지 않는다(075의 A). 앱이 삭제 직전에 애플 인증을 다시 받아 {@code authorizationCode}를 주면,
 * {@link #exchange}로 토큰을 받아 같은 사람인지 보고, 꾸메 쪽을 지운 뒤 {@link #revoke}로 회수한다.
 */
public interface AppleAccountClient {

	/** 회수용 키({@code kkume.auth.apple.key-id} · {@code private-key})가 있는가. 없으면 교환 · 회수를 하지 않는다 */
	boolean enabled();

	/**
	 * 인가 코드를 토큰으로 바꾼다. 받은 ID 토큰은 로그인 때와 같은 규칙으로 검증한다.
	 *
	 * @throws AppleCodeRejectedException 애플이 코드를 거절했다(만료 · 이미 씀 · 다른 앱의 코드) — 앱이 다시 인증을 받으면 된다
	 * @throws AppleUnavailableException 애플에 닿지 못했거나 우리 설정(키)이 틀렸다 — 다시 인증해도 소용없다
	 */
	AppleGrant exchange(String authorizationCode);

	/** 회수. 실패해도 던지지 않는다 — 꾸메 쪽 삭제는 이미 끝났고 되돌리지 않는다. 결과는 로그로 남긴다 */
	void revoke(AppleGrant grant);

	/**
	 * @param subject 애플 계정 식별자({@code sub}) — 꾸메 계정의 {@code provider_id}와 같아야 지운다
	 * @param refreshToken 회수에 쓴다. 인가 코드로 받으면 보통 있다
	 * @param accessToken {@code refreshToken}이 없을 때 대신 회수한다
	 */
	record AppleGrant(String subject, String refreshToken, String accessToken) {

		@Override
		public String toString() {
			// 토큰이 로그에 찍히지 않게
			return "AppleGrant[subject=" + this.subject + "]";
		}
	}

	class AppleCodeRejectedException extends RuntimeException {

		public AppleCodeRejectedException(String message) {
			super(message);
		}
	}

	class AppleUnavailableException extends RuntimeException {

		public AppleUnavailableException(String message, Throwable cause) {
			super(message, cause);
		}
	}
}
