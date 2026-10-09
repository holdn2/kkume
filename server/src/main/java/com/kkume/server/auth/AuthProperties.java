package com.kkume.server.auth;

import java.time.Duration;
import java.util.List;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * 인증 설정.
 *
 * @param google 소셜 제공자별 설정
 * @param apple 애플 로그인 · 계정 삭제 때 토큰 회수(문서 075 · 076)
 * @param jwt 서버가 발급하는 토큰 설정
 */
@ConfigurationProperties(prefix = "kkume.auth")
public record AuthProperties(Google google, Apple apple, Jwt jwt) {

	/**
	 * @param clientIds 받아들일 구글 client id 목록. ID 토큰의 {@code aud} 를 이것과 대조한다.
	 *     <b>비어 있으면 다른 앱을 위해 발급된 구글 토큰도 통과한다</b> — 그래서 비어 있으면
	 *     기동 자체를 막는다.
	 */
	public record Google(List<String> clientIds) {
	}

	/**
	 * @param clientIds 받아들일 {@code aud}. 네이티브 로그인이라 앱의 번들 ID 다. 비어 있으면 기동을 막는다(구글과 같은 이유)
	 * @param teamId 애플 개발자 팀 ID. 회수용 client secret 의 {@code iss}
	 * @param keyId Sign in with Apple 키의 ID(10자). client secret 헤더의 {@code kid}
	 * @param privateKey 그 키의 {@code .p8} 내용 — PEM 그대로든 머리줄 없이 base64 한 줄이든 받는다.
	 *     {@code keyId}와 함께 <b>비어 있으면 로그인은 되고 계정 삭제 때 애플 토큰 회수만 건너뛴다</b>(경고 로그)
	 */
	public record Apple(List<String> clientIds, String teamId, String keyId, String privateKey) {

		public boolean canRevoke() {
			return this.keyId != null && !this.keyId.isBlank() && this.privateKey != null && !this.privateKey.isBlank();
		}
	}

	/**
	 * @param secret 서명 키. 비워 두면 기동할 때마다 새로 만든다(아래 설명 참조)
	 * @param ttl 발급한 토큰의 수명
	 */
	public record Jwt(String secret, Duration ttl) {
	}
}
