package com.kkume.server.audio;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.OptionalLong;

/**
 * 오디오 원본을 두는 곳. 운영은 S3, 테스트는 메모리 구현이다.
 *
 * <p>서버는 파일 바이트를 만지지 않는다. 앱이 {@link #presignUpload}로 받은 URL 에 직접 올리고,
 * 서버는 있는지와 크기만 본다 — 느린 모바일 업로드를 t3.micro 가 붙잡고 있지 않게 하기 위해서다(문서 039).
 */
public interface AudioStorage {

	/**
	 * 앱이 파일을 PUT 할 URL. 서명에 {@code headers}가 들어가므로 앱은 그대로 붙여야 한다.
	 *
	 * @param contentLength 있으면 서명에 크기를 넣는다 — 그 크기가 아닌 파일은 S3 가 받지 않는다(문서 105 R3).
	 *     앱의 업로드 함수가 파일 크기로 {@code Content-Length}를 붙이므로 {@code headers}에는 넣지 않는다
	 */
	Ticket presignUpload(String key, String contentType, Long contentLength);

	/** {@code prefix}로 시작하는 파일과 올라간 시각 */
	List<Stored> list(String prefix);

	/** 올라간 파일의 크기. 없으면 비어 있다 */
	OptionalLong sizeOf(String key);

	void delete(String key);

	/**
	 * {@code prefix}로 시작하는 파일을 전부 지운다. 계정 삭제가 쓴다(문서 064 · 066).
	 * 하나라도 못 지우면 던진다 — 조용히 넘어가면 "지웠다"고 답한 뒤 녹음이 남는다.
	 */
	void deleteAll(String prefix);

	/** 기록의 {@code audio_url}에 적는 값. URL 이 아니라 저장 위치 식별자다 */
	String location(String key);

	record Ticket(String url, Map<String, String> headers, Instant expiresAt) {
	}

	record Stored(String key, Instant lastModified) {
	}
}
