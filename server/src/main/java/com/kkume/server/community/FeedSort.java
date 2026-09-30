package com.kkume.server.community;

/** 피드 · 사용자 글 목록의 정렬 두 가지(문서 056 03장) */
public enum FeedSort {

	/** 올린 시각 내림차순 */
	LATEST("latest"),
	/** 공감 수 내림차순, 같으면 최신 */
	EMPATHY("empathy");

	private final String code;

	FeedSort(String code) {
		this.code = code;
	}

	public String code() {
		return code;
	}

	/** 비어 있으면 최신순 */
	static FeedSort of(String code) {
		if (code == null || code.isBlank()) {
			return LATEST;
		}
		for (FeedSort sort : values()) {
			if (sort.code.equals(code)) {
				return sort;
			}
		}
		throw CommunityApiException.badRequest("invalid_sort", "정렬은 latest · empathy 중 하나입니다");
	}
}
