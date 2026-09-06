package com.kkume.server.dream;

import java.time.Instant;

/**
 * 서버가 기기로 내려보내는 꿈 기록 한 건.
 *
 * <p>지워진 기록도 이 모양 그대로 내려간다. {@code deletedAt} 이 채워진 채로 간다 —
 * 목록에서 빼 버리면 기기는 삭제를 영영 모르고, 지운 기록이 다음 동기화에서 되살아난다.
 *
 * @param updatedAt <b>서버 시계</b>. 다음 요청의 {@code since} 가 되는 값이다
 * @param clientUpdatedAt 기기 시계. 기기가 자기 것과 견줘 볼 때 쓴다
 */
public record DreamView(String id, Instant recordedAt, String title, String text, String audioUrl,
		String sttStatus, Integer durationMs, Instant reviewedAt, Instant deletedAt,
		Instant createdAt, Instant updatedAt, Instant clientUpdatedAt) {

	static DreamView of(Dream dream) {
		return new DreamView(dream.getId(), dream.getRecordedAt(), dream.getTitle(), dream.getText(),
				dream.getAudioUrl(), dream.getSttStatus().code(), dream.getDurationMs(),
				dream.getReviewedAt(), dream.getDeletedAt(), dream.getCreatedAt(),
				dream.getUpdatedAt(), dream.getClientUpdatedAt());
	}
}
