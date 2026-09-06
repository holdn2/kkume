package com.kkume.server.dream;

import java.time.Instant;

/**
 * 기기가 올려 보내는 꿈 기록 한 건.
 *
 * <p><b>audioUrl 이 없다.</b> 오디오는 이 API 가 아니라 업로드 쪽에서 붙는다.
 * 기기는 자기 파일 경로만 알고 S3 주소는 모르므로, 여기서 받으면 이미 올라간
 * 원본 주소를 기기의 {@code null} 이나 로컬 경로로 덮어쓰게 된다(설계상 절대 규칙 2).
 *
 * <p>{@code sttStatus} 도 없다. 그것은 서버가 STT 를 돌리며 바꾸는 값이라
 * 기기가 되돌릴 수 있으면 안 된다.
 *
 * @param id 기기가 만든 id. 서버가 새로 만들지 않는다
 * @param updatedAt <b>기기 시계</b> 기준 마지막 수정 시각. 충돌 판정에 쓴다
 * @param deletedAt 채워져 있으면 기기에서 지운 것이다
 */
public record DreamPayload(String id, Instant recordedAt, String title, String text, Integer durationMs,
		Instant reviewedAt, Instant deletedAt, Instant updatedAt) {
}
