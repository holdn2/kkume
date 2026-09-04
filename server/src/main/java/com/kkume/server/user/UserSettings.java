package com.kkume.server.user;

import java.time.Instant;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/**
 * 사용자별 설정.
 *
 * 기상 시각은 Android 진입점(고정 알림 재게시)이 성립하기 위한 필수 입력이다 —
 * "언제 다시 올릴 것인가"를 알아야 하기 때문이다(문서 009 07장).
 * 온보딩에서 묻고 기본값으로 건너뛸 수 있게 하므로 여기서는 null 을 허용한다.
 */
@Entity
@Table(name = "user_settings")
public class UserSettings {

	@Id
	@Column(name = "user_id")
	private UUID userId;

	@Column(name = "wake_hour")
	private Short wakeHour;

	@Column(name = "wake_minute")
	private Short wakeMinute;

	@Column(name = "notify_enabled", nullable = false)
	private boolean notifyEnabled = true;

	@Column(nullable = false, length = 64)
	private String timezone = "Asia/Seoul";

	@Column(name = "created_at", nullable = false)
	private Instant createdAt;

	@Column(name = "updated_at", nullable = false)
	private Instant updatedAt;

	protected UserSettings() {
		// JPA
	}

	public UserSettings(UUID userId, Instant now) {
		this.userId = userId;
		this.createdAt = now;
		this.updatedAt = now;
	}

	public UUID getUserId() {
		return userId;
	}

	public Short getWakeHour() {
		return wakeHour;
	}

	public Short getWakeMinute() {
		return wakeMinute;
	}

	public void changeWakeTime(Short hour, Short minute, Instant now) {
		this.wakeHour = hour;
		this.wakeMinute = minute;
		this.updatedAt = now;
	}

	public boolean isNotifyEnabled() {
		return notifyEnabled;
	}

	public void changeNotifyEnabled(boolean enabled, Instant now) {
		this.notifyEnabled = enabled;
		this.updatedAt = now;
	}

	public String getTimezone() {
		return timezone;
	}

	public void changeTimezone(String timezone, Instant now) {
		this.timezone = timezone;
		this.updatedAt = now;
	}

	public Instant getCreatedAt() {
		return createdAt;
	}

	public Instant getUpdatedAt() {
		return updatedAt;
	}
}
