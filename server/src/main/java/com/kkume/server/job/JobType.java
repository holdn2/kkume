package com.kkume.server.job;

import jakarta.persistence.AttributeConverter;
import jakarta.persistence.Converter;

/** 작업 종류. 7주차에 만화({@code comic})가 더해진다. */
public enum JobType {

	STT("stt");

	private final String code;

	JobType(String code) {
		this.code = code;
	}

	public String code() {
		return code;
	}

	public static JobType from(String code) {
		for (JobType t : values()) {
			if (t.code.equals(code)) {
				return t;
			}
		}
		throw new IllegalArgumentException("알 수 없는 job type: " + code);
	}

	@Converter(autoApply = true)
	public static class JpaConverter implements AttributeConverter<JobType, String> {

		@Override
		public String convertToDatabaseColumn(JobType attribute) {
			return attribute == null ? null : attribute.code;
		}

		@Override
		public JobType convertToEntityAttribute(String dbData) {
			return dbData == null ? null : from(dbData);
		}
	}
}
