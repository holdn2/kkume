package com.kkume.server.comic;

/**
 * 만화 그림을 두는 곳. 운영은 S3, 테스트는 메모리 구현이다.
 *
 * <p>버킷은 공개를 막아 두고 앱에는 짧게 사는 presigned GET 만 준다(문서 081 04장).
 * 그림은 {@code comics/{userId}/{comicId}/}, 꿈 나눔에 붙인 복사본은 {@code posts/{postId}/}에 둔다.
 */
public interface ComicStorage {

	void put(String key, byte[] bytes, String contentType);

	/** 앱이 그림을 받을 주소 */
	String presignGet(String key);

	void copy(String fromKey, String toKey);

	/**
	 * {@code prefix}로 시작하는 파일을 전부 지운다. 하나라도 못 지우면 던진다 — 계정 삭제가 "지웠다"고 답한 뒤 그림이 남지 않게.
	 */
	void deleteAll(String prefix);

	static String comicPrefix(java.util.UUID userId, java.util.UUID comicId) {
		return userPrefix(userId) + comicId + "/";
	}

	static String userPrefix(java.util.UUID userId) {
		return "comics/" + userId + "/";
	}

	static String postPrefix(java.util.UUID postId) {
		return "posts/" + postId + "/";
	}
}
