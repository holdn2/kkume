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
}
