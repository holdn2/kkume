package com.kkume.server.auth;

import java.time.Duration;
import java.util.List;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * 인증 설정.
 *
 * @param google 소셜 제공자별 설정
 * @param jwt 서버가 발급하는 토큰 설정
 */
@ConfigurationProperties(prefix = "kkume.auth")
public record AuthProperties(Google google, Jwt jwt) {

	/**
	 * @param clientIds 받아들일 구글 client id 목록. ID 토큰의 {@code aud} 를 이것과 대조한다.
	 *     <b>비어 있으면 다른 앱을 위해 발급된 구글 토큰도 통과한다</b> — 그래서 비어 있으면
	 *     기동 자체를 막는다.
	 */
	public record Google(List<String> clientIds) {
	}

	/**
	 * @param secret 서명 키. 비워 두면 기동할 때마다 새로 만든다(아래 설명 참조)
	 * @param ttl 발급한 토큰의 수명
	 */
	public record Jwt(String secret, Duration ttl) {
	}
}
