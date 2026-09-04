package com.kkume.server.dream;

import jakarta.persistence.AttributeConverter;
import jakarta.persistence.Converter;

/**
 * 음성 기록의 STT 진행 상태.
 *
 * DB에는 소문자로 저장한다 — 모바일의 stt_status 와 같은 값이어야 한다.
 * failed 로 끝나도 audio_url 이 남아 있어 기록 자체는 사라지지 않는다.
 */
public enum SttStatus {

	PENDING("pending"),
	DONE("done"),
	FAILED("failed");

	private final String code;

	SttStatus(String code) {
		this.code = code;
	}

	public String code() {
		return code;
	}

	public static SttStatus from(String code) {
		for (SttStatus s : values()) {
			if (s.code.equals(code)) {
				return s;
			}
		}
		throw new IllegalArgumentException("알 수 없는 stt_status: " + code);
	}

	@Converter(autoApply = true)
	public static class JpaConverter implements AttributeConverter<SttStatus, String> {

		@Override
		public String convertToDatabaseColumn(SttStatus attribute) {
			return attribute == null ? null : attribute.code;
		}

		@Override
		public SttStatus convertToEntityAttribute(String dbData) {
			return dbData == null ? null : from(dbData);
		}
	}
}
