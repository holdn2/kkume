package com.kkume.server.comic;

import java.time.Duration;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * 꿈 만화 설정(문서 081 06장).
 *
 * @param bucket 그림을 둘 S3 버킷. 녹음과 같은 버킷이다. <b>비어 있으면 만화를 만들지 않는다</b>(503 {@code comic_unavailable})
 * @param region 버킷 리전
 * @param imageTtl 앱에 주는 presigned GET 의 수명. 앱은 주소를 저장하지 않고 열 때마다 다시 받는다
 * @param userDailyLimit 1인 하루(KST 자정) 몫. 거절 · 실패는 세지 않는다
 * @param serviceDailyLimit 서비스 전체 하루(UTC 자정 — Cloudflare 무료 한도가 다시 채워지는 때) 몫. 실패도 센다
 * @param workerEnabled 끄면 만화를 받아 두기만 하고 그리지 않는다(테스트)
 * @param poll 줄을 들여다보는 간격
 * @param lease scripting · drawing 에 이보다 오래 머물면 잡은 서버가 죽은 것으로 보고 실패로 끝낸다
 * @param cloudflare Workers AI 접속 정보. 계정 · 토큰이 비면 만화를 만들지 않는다
 */
@ConfigurationProperties(prefix = "kkume.comic")
public record ComicProperties(String bucket, String region, Duration imageTtl, int userDailyLimit,
		int serviceDailyLimit, boolean workerEnabled, Duration poll, Duration lease, Cloudflare cloudflare) {

	/**
	 * @param accountId Cloudflare 계정 ID
	 * @param apiToken Workers AI 권한만 있는 API 토큰. 저장소에 두지 않는다
	 * @param scriptModel 대본 모델(OpenAI 호환 chat completions)
	 * @param imageModel 그림 모델(multipart)
	 * @param timeout 호출 하나의 응답 시한. 그림은 20~36초 걸렸다(문서 082)
	 */
	public record Cloudflare(String accountId, String apiToken, String scriptModel, String imageModel,
			Duration timeout) {

		public boolean configured() {
			return accountId != null && !accountId.isBlank() && apiToken != null && !apiToken.isBlank();
		}
	}

	public boolean storageEnabled() {
		return bucket != null && !bucket.isBlank();
	}
}
