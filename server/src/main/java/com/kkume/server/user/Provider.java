package com.kkume.server.user;

import jakarta.persistence.AttributeConverter;
import jakarta.persistence.Converter;

/**
 * 소셜 로그인 제공자.
 *
 * DB에는 소문자로 저장한다. 모바일과 API가 주고받는 값이 소문자라
 * 여기서만 대문자를 쓰면 경계마다 변환이 필요해진다.
 */
public enum Provider {

	KAKAO("kakao"),
	GOOGLE("google"),
	APPLE("apple");

	private final String code;

	Provider(String code) {
		this.code = code;
	}

	public String code() {
		return code;
	}

	public static Provider from(String code) {
		for (Provider p : values()) {
			if (p.code.equals(code)) {
				return p;
			}
		}
		throw new IllegalArgumentException("알 수 없는 provider: " + code);
	}

	@Converter(autoApply = true)
	public static class JpaConverter implements AttributeConverter<Provider, String> {

		@Override
		public String convertToDatabaseColumn(Provider attribute) {
			return attribute == null ? null : attribute.code;
		}

		@Override
		public Provider convertToEntityAttribute(String dbData) {
			return dbData == null ? null : from(dbData);
		}
	}
}
