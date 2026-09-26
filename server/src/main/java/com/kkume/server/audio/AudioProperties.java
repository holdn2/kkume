package com.kkume.server.audio;

import java.time.Duration;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * 오디오 원본 보관 설정.
 *
 * @param bucket S3 버킷 이름. <b>비어 있으면 업로드를 받지 않는다</b>(503 {@code audio_unavailable}) —
 *     로컬에서 버킷 없이 서버를 띄우는 경우다
 * @param region 버킷 리전. 무료 플랜 계정은 시드니에 묶여 있다
 * @param maxBytes 받는 파일의 최대 크기. <b>가안</b> 25MB(128kbps 로 약 26분) — 변환 서비스를 고르면 그 한도에 맞춘다
 * @param uploadTtl presigned URL 의 유효시간
 */
@ConfigurationProperties(prefix = "kkume.audio")
public record AudioProperties(String bucket, String region, long maxBytes, Duration uploadTtl) {

	public boolean enabled() {
		return bucket != null && !bucket.isBlank();
	}
}
