package com.kkume.server.job;

import java.time.Duration;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * 변환 작업 큐 설정. 숫자는 전부 <b>가안</b>이다 — 변환 서비스를 고르면 실제 변환 시간을 보고 정한다(문서 039).
 *
 * @param workerEnabled 일꾼을 돌릴지. 테스트는 끄고 {@link SttWorker#runOnce()}를 직접 부른다
 * @param poll 줄을 들여다보는 간격
 * @param maxAttempts 자동으로 시도하는 최대 횟수. 넘으면 failed
 * @param backoff 실패한 뒤 다시 잡기까지 기다리는 시간의 단위. 시도 횟수만큼 곱한다
 * @param lease running 으로 이만큼 머물면 잡은 서버가 죽은 것으로 본다
 * @param enqueue 업로드가 끝나면 변환 작업을 만들지. <b>지금은 끈다</b> — 받아쓰기를 기기가 녹음하면서 한다(문서 048).
 *     서버 변환을 예비로 붙이는 날(한국어 모델이 없는 폰 · Android) 켠다
 */
@ConfigurationProperties(prefix = "kkume.stt")
public record SttProperties(boolean workerEnabled, Duration poll, int maxAttempts, Duration backoff, Duration lease,
		boolean enqueue) {
}
