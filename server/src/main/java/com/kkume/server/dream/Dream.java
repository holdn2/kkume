package com.kkume.server.dream;

import java.time.Instant;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/**
 * 꿈 기록 한 건. 기기의 SQLite {@code dreams} 를 서버가 미러링한 것이다.
 *
 * <p><b>id 는 서버가 만들지 않는다.</b> 오프라인 우선 구조라 기기가 만든 id 가
 * 그대로 올라온다. UUID 가 아니라 "36진수 시각-난수6" 형태의 문자열이다.
 *
 * <p>기기의 {@code audio_path} 는 여기서 {@code audioUrl} 이 된다 —
 * 로컬은 파일 경로, 서버는 S3 URL 이라 이름이 다른 것이 맞다.
 * 기기의 {@code synced_at} 은 여기에 없다. 기기가 "올렸는지"를 기억하는 값이라
 * 서버가 알 필요도 없고 알 수도 없다.
 */
@Entity
@Table(name = "dreams")
public class Dream {

	@Id
	@Column(length = 64)
	private String id;

	@Column(name = "user_id", nullable = false)
	private UUID userId;

	@Column(name = "recorded_at", nullable = false)
	private Instant recordedAt;

	private String title;

	@Column(columnDefinition = "text")
	private String text;

	/** S3 URL. STT 가 틀려도 원본으로 복원할 수 있게 하는 유일한 장치다 */
	@Column(name = "audio_url", columnDefinition = "text")
	private String audioUrl;

	@Column(name = "stt_status", nullable = false, length = 16)
	private SttStatus sttStatus = SttStatus.PENDING;

	@Column(length = 32)
	private String emotion;

	/** 태깅 보류. 컬럼만 확보해 두고 나중에 backfill 로 소급한다 */
	@Column(columnDefinition = "text")
	private String keywords;

	@Column(columnDefinition = "text")
	private String characters;

	@Column(name = "duration_ms")
	private Integer durationMs;

	/** 낮에 확인을 마친 시각. null 이면 아직 안 본 기록이다 */
	@Column(name = "reviewed_at")
	private Instant reviewedAt;

	@Column(name = "created_at", nullable = false)
	private Instant createdAt;

	@Column(name = "updated_at", nullable = false)
	private Instant updatedAt;

	/**
	 * 기기가 이 기록을 마지막으로 고친 시각. <b>충돌 판정에만 쓴다.</b>
	 *
	 * <p>{@link #updatedAt} 과 나눈 이유는 시계가 다르기 때문이다. 커서는 서버 시각을
	 * 따라가야 순서가 뒤로 가지 않고, 충돌은 기기 시각으로 봐야 늦게 올라온 최신 수정이
	 * 옛 내용에 덮이지 않는다.
	 */
	@Column(name = "client_updated_at", nullable = false)
	private Instant clientUpdatedAt;

	@Column(name = "deleted_at")
	private Instant deletedAt;

	protected Dream() {
		// JPA
	}

	public Dream(String id, UUID userId, Instant recordedAt, Instant now) {
		this.id = id;
		this.userId = userId;
		this.recordedAt = recordedAt;
		this.createdAt = now;
		this.updatedAt = now;
		this.clientUpdatedAt = now;
	}

	public String getId() {
		return id;
	}

	public UUID getUserId() {
		return userId;
	}

	public Instant getRecordedAt() {
		return recordedAt;
	}

	public String getTitle() {
		return title;
	}

	public String getText() {
		return text;
	}

	public String getAudioUrl() {
		return audioUrl;
	}

	public SttStatus getSttStatus() {
		return sttStatus;
	}

	public String getEmotion() {
		return emotion;
	}

	public String getKeywords() {
		return keywords;
	}

	public String getCharacters() {
		return characters;
	}

	public Integer getDurationMs() {
		return durationMs;
	}

	public Instant getReviewedAt() {
		return reviewedAt;
	}

	public Instant getCreatedAt() {
		return createdAt;
	}

	public Instant getUpdatedAt() {
		return updatedAt;
	}

	public Instant getClientUpdatedAt() {
		return clientUpdatedAt;
	}

	public Instant getDeletedAt() {
		return deletedAt;
	}

	public boolean isDeleted() {
		return deletedAt != null;
	}

	/**
	 * 기기에서 올라온 내용으로 갱신한다. 동기화 API 가 쓴다.
	 *
	 * <p><b>audioUrl 은 여기서 지워지지 않는다.</b> 기기가 null 을 보내더라도
	 * 이미 올라간 원본을 지우지 않는다 — 그것이 기록 소실의 유일한 경로가 된다.
	 */
	public void apply(String title, String text, Integer durationMs, Instant recordedAt,
			Instant reviewedAt, Instant deletedAt, Instant clientUpdatedAt, Instant now) {
		this.title = title;
		this.text = text;
		this.durationMs = durationMs;
		this.recordedAt = recordedAt;
		this.reviewedAt = reviewedAt;
		this.deletedAt = deletedAt;
		this.clientUpdatedAt = clientUpdatedAt;
		this.updatedAt = now;
	}

	/**
	 * 올라온 것이 서버에 있는 것보다 새로운가. 같으면 <b>서버를 유지한다</b> —
	 * 같은 시각이면 어느 쪽이 옳은지 알 방법이 없고, 그때 덮어쓰면 이미 반영된
	 * 내용이 한 번 더 왕복하면서 흔들린다.
	 */
	public boolean isOlderThan(Instant incomingClientUpdatedAt) {
		return this.clientUpdatedAt.isBefore(incomingClientUpdatedAt);
	}

	public void attachAudio(String audioUrl, Instant now) {
		this.audioUrl = audioUrl;
		this.updatedAt = now;
	}

	public void changeSttStatus(SttStatus status, Instant now) {
		this.sttStatus = status;
		this.updatedAt = now;
	}

	public void softDelete(Instant now) {
		this.deletedAt = now;
		this.updatedAt = now;
	}
}
