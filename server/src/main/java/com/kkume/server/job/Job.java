package com.kkume.server.job;

import java.time.Duration;
import java.time.Instant;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/**
 * 서버 안에서 오래 걸리는 일 하나. 기록 하나에 같은 종류는 하나뿐이다({@code uq_jobs_dream_type}).
 */
@Entity
@Table(name = "jobs")
public class Job {

	@Id
	private UUID id;

	@Column(nullable = false, length = 16)
	private JobType type;

	@Column(name = "dream_id", nullable = false, length = 64)
	private String dreamId;

	@Column(name = "user_id", nullable = false)
	private UUID userId;

	@Column(nullable = false, length = 16)
	private JobStatus status;

	@Column(nullable = false)
	private int attempts;

	/** 변환 원문. 앱이 text 에 합치기 전의 것이다 */
	@Column(columnDefinition = "text")
	private String result;

	@Column(length = 64)
	private String error;

	@Column(name = "run_after", nullable = false)
	private Instant runAfter;

	@Column(name = "locked_at")
	private Instant lockedAt;

	@Column(name = "created_at", nullable = false)
	private Instant createdAt;

	@Column(name = "updated_at", nullable = false)
	private Instant updatedAt;

	protected Job() {
		// JPA
	}

	public Job(JobType type, String dreamId, UUID userId, Instant now) {
		this.id = UUID.randomUUID();
		this.type = type;
		this.dreamId = dreamId;
		this.userId = userId;
		this.status = JobStatus.QUEUED;
		this.runAfter = now;
		this.createdAt = now;
		this.updatedAt = now;
	}

	public UUID getId() {
		return id;
	}

	public JobType getType() {
		return type;
	}

	public String getDreamId() {
		return dreamId;
	}

	public UUID getUserId() {
		return userId;
	}

	public JobStatus getStatus() {
		return status;
	}

	public int getAttempts() {
		return attempts;
	}

	public String getResult() {
		return result;
	}

	public String getError() {
		return error;
	}

	public Instant getRunAfter() {
		return runAfter;
	}

	public Instant getUpdatedAt() {
		return updatedAt;
	}

	/** 일꾼이 잡는다. 시도 횟수는 잡을 때 센다 — 도중에 서버가 죽어도 한 번으로 친다 */
	void start(Instant now) {
		this.status = JobStatus.RUNNING;
		this.attempts += 1;
		this.lockedAt = now;
		this.updatedAt = now;
	}

	void succeed(String result, Instant now) {
		this.status = JobStatus.DONE;
		this.result = result;
		this.error = null;
		this.lockedAt = null;
		this.updatedAt = now;
	}

	/** 다시 시도할 수 있게 줄 뒤로 보낸다 */
	void requeue(String error, Instant runAfter, Instant now) {
		this.status = JobStatus.QUEUED;
		this.error = error;
		this.runAfter = runAfter;
		this.lockedAt = null;
		this.updatedAt = now;
	}

	void fail(String error, Instant now) {
		this.status = JobStatus.FAILED;
		this.error = error;
		this.lockedAt = null;
		this.updatedAt = now;
	}

	/** 사용자가 다시 시도를 눌렀다. 횟수를 처음부터 센다 */
	public void retry(Instant now) {
		this.status = JobStatus.QUEUED;
		this.attempts = 0;
		this.error = null;
		this.runAfter = now;
		this.lockedAt = null;
		this.updatedAt = now;
	}

	/** 너무 오래 running 이면 잡은 서버가 죽은 것이다 */
	boolean isStale(Instant now, Duration lease) {
		return this.status == JobStatus.RUNNING && this.lockedAt != null
				&& this.lockedAt.plus(lease).isBefore(now);
	}
}
