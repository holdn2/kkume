package com.kkume.server.audio;

import java.util.Arrays;
import java.util.Optional;

/**
 * 받는 녹음 형식. 앱이 {@code upload}에 알리고, 서버는 그에 맞는 확장자로 키를 만들고
 * {@code Content-Type}을 서명에 넣는다.
 *
 * <p>둘을 함께 받는 이유 — 받아쓰기 녹음(문서 048)은 WAV로만 남는다. 인식 라이브러리가 소리를
 * 파일로 쓸 때 WAV 외의 형식을 고를 수 없어서다. 그 전의 녹음과 받아쓰기를 못 하는 기기의 녹음은
 * 여전히 m4a다. 앱이 형식을 알리지 않으면 m4a로 본다 — 형식을 보내지 않던 옛 앱이 그대로 동작한다.
 */
public enum AudioFormat {

	M4A("m4a", "audio/mp4"),
	WAV("wav", "audio/wav");

	private final String code;

	private final String contentType;

	AudioFormat(String code, String contentType) {
		this.code = code;
		this.contentType = contentType;
	}

	public String code() {
		return code;
	}

	public String contentType() {
		return contentType;
	}

	public String extension() {
		return "." + code;
	}

	/** 비어 있으면 m4a. 모르는 값이면 비어 있는 결과 */
	static Optional<AudioFormat> of(String code) {
		if (code == null || code.isBlank()) {
			return Optional.of(M4A);
		}
		return Arrays.stream(values()).filter(f -> f.code.equals(code)).findFirst();
	}
}
