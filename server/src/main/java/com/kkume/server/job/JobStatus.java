package com.kkume.server.job;

import jakarta.persistence.AttributeConverter;
import jakarta.persistence.Converter;

/**
 * 작업의 진행 상태. DB에는 소문자로 저장한다.
 *
 * <p>기록의 {@code stt_status}(pending · done · failed)와는 다른 값이다. 이쪽은 서버 안에서
 * "누가 잡고 있는가"까지 구분해야 해서 {@code queued}와 {@code running}이 나뉜다.
 * 앱에 보이는 것은 기록의 {@code stt_status} 쪽이다.
 */
public enum JobStatus {

	QUEUED("queued"),
	RUNNING("running"),
	DONE("done"),
	FAILED("failed");

	private final String code;

	JobStatus(String code) {
		this.code = code;
	}

	public String code() {
		return code;
	}

	public static JobStatus from(String code) {
		for (JobStatus s : values()) {
			if (s.code.equals(code)) {
				return s;
			}
		}
		throw new IllegalArgumentException("알 수 없는 job status: " + code);
	}

	@Converter(autoApply = true)
	public static class JpaConverter implements AttributeConverter<JobStatus, String> {

		@Override
		public String convertToDatabaseColumn(JobStatus attribute) {
			return attribute == null ? null : attribute.code;
		}

		@Override
		public JobStatus convertToEntityAttribute(String dbData) {
			return dbData == null ? null : from(dbData);
		}
	}
}
