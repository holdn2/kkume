package com.kkume.server.community;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Base64;
import java.util.UUID;

/**
 * 목록의 다음 쪽 위치. 앱에는 불투명한 문자열로 나간다.
 *
 * <p>동기화와 같은 키셋이다 — 마지막 항목의 정렬 키를 들고 있다가 "그보다 뒤"를 고른다.
 * 쪽 사이에 글이 새로 올라와도 번호로 건너뛰는 방식처럼 겹치거나 빠지지 않는다.
 * 단 공감순은 키 자체(공감 수)가 움직이므로 앱이 {@code id}로 중복을 걸러야 한다(문서 056).
 *
 * @param likeCount 공감순일 때만 뜻이 있다
 */
record FeedCursor(FeedSort sort, int likeCount, Instant createdAt, UUID id) {

	String encode() {
		String raw = sort.code() + "|" + likeCount + "|" + createdAt + "|" + id;
		return Base64.getUrlEncoder().withoutPadding().encodeToString(raw.getBytes(StandardCharsets.UTF_8));
	}

	/**
	 * 다른 정렬에서 온 커서는 받지 않는다. 받으면 공감순 위치를 최신순 키로 읽어 엉뚱한 곳부터 준다.
	 *
	 * @return 커서가 없으면 {@code null}(첫 쪽)
	 */
	static FeedCursor decode(String cursor, FeedSort expected) {
		if (cursor == null || cursor.isBlank()) {
			return null;
		}
		try {
			String[] parts = new String(Base64.getUrlDecoder().decode(cursor), StandardCharsets.UTF_8).split("\\|", -1);
			if (parts.length != 4 || !parts[0].equals(expected.code())) {
				throw invalid();
			}
			return new FeedCursor(expected, Integer.parseInt(parts[1]), Instant.parse(parts[2]), UUID.fromString(parts[3]));
		}
		catch (IllegalArgumentException | java.time.format.DateTimeParseException ex) {
			throw invalid();
		}
	}

	private static CommunityApiException invalid() {
		return CommunityApiException.badRequest("invalid_cursor", "목록 위치가 올바르지 않습니다");
	}
}
