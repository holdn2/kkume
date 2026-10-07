package com.kkume.server.user;

import java.time.Instant;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/**
 * 소셜 계정 하나에 대응하는 사용자.
 *
 * 삭제는 지우지 않고 {@code deletedAt} 을 채운다. 계정 삭제 요건을 만족하면서
 * 커뮤니티(게시글 · 댓글)의 참조 무결성을 유지하기 위한 것이다.
 */
@Entity
@Table(name = "users")
public class User {

	@Id
	private UUID id;

	@Column(nullable = false, length = 16)
	private Provider provider;

	@Column(name = "provider_id", nullable = false)
	private String providerId;

	/** 랜덤으로 부여하고 나중에 바꾼다. 꿈은 사적인 내용이라 실명을 쓰지 않는다 */
	@Column(nullable = false, length = 64)
	private String nickname;

	@Column(name = "created_at", nullable = false)
	private Instant createdAt;

	@Column(name = "updated_at", nullable = false)
	private Instant updatedAt;

	@Column(name = "deleted_at")
	private Instant deletedAt;

	/** 동의한 가장 새 약관 버전(YYYY-MM-DD). 동의 전이면 비어 있다 */
	@Column(name = "consent_version", length = 10)
	private String consentVersion;

	/** 그 버전에 처음 동의한 서버 시각 */
	@Column(name = "consented_at")
	private Instant consentedAt;

	protected User() {
		// JPA
	}

	public User(UUID id, Provider provider, String providerId, String nickname, Instant now) {
		this.id = id;
		this.provider = provider;
		this.providerId = providerId;
		this.nickname = nickname;
		this.createdAt = now;
		this.updatedAt = now;
	}

	public UUID getId() {
		return id;
	}

	public Provider getProvider() {
		return provider;
	}

	public String getProviderId() {
		return providerId;
	}

	public String getNickname() {
		return nickname;
	}

	public void rename(String nickname, Instant now) {
		this.nickname = nickname;
		this.updatedAt = now;
	}

	public Instant getCreatedAt() {
		return createdAt;
	}

	public Instant getUpdatedAt() {
		return updatedAt;
	}

	public Instant getDeletedAt() {
		return deletedAt;
	}

	public void softDelete(Instant now) {
		this.deletedAt = now;
		this.updatedAt = now;
	}

	public boolean isDeleted() {
		return deletedAt != null;
	}

	public String getConsentVersion() {
		return consentVersion;
	}

	public Instant getConsentedAt() {
		return consentedAt;
	}

	/**
	 * 동의를 기록한다(문서 070 02장). 같은 버전이면 처음 시각을 덮지 않고 — "언제 동의했나"의 답이 바뀌면 안 된다 —
	 * 더 옛 버전이면 내리지 않는다(옛 앱이 옛 버전을 보내도 새 동의가 지워지지 않게). 버전은 날짜 모양이라 문자열 비교가 곧 순서다.
	 */
	public void recordConsent(String version, Instant now) {
		if (this.consentVersion != null && this.consentVersion.compareTo(version) >= 0) {
			return;
		}
		this.consentVersion = version;
		this.consentedAt = now;
		this.updatedAt = now;
	}
}
