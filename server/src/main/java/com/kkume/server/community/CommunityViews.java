package com.kkume.server.community;

import java.time.Instant;
import java.util.List;

import com.kkume.server.comic.ComicAttachments;

/**
 * 커뮤니티 응답 모양. 이름은 모바일 {@code CommunityApi}(문서 056 03장)와 같다.
 */
public final class CommunityViews {

	private CommunityViews() {
	}

	public record Author(String id, String nickname) {
	}

	/**
	 * 피드 · 사용자 글 목록의 한 줄.
	 *
	 * @param excerpt 꿈 내용 앞 120자. 줄바꿈은 공백 하나로
	 * @param hidden 신고로 가려진 글. 가려진 글은 작성자에게만 나가므로 {@code true}는 늘 "내 글"이다
	 */
	public record PostSummary(String id, Author author, String title, String excerpt, Instant dreamRecordedAt,
			boolean hasComic, int likeCount, int commentCount, boolean likedByMe, Instant createdAt, boolean hidden) {
	}

	/**
	 * 목록의 필드에 상세만의 것을 더한다. 모바일이 {@code PostSummary & {...}}로 받는다.
	 *
	 * @param comicUrl 붙인 만화 그림 한 장(2×2). 지금 앱이 읽는 자리라 남긴다 — {@code comic.imageUrls[0]}과 같다
	 * @param comic 붙인 만화 전체(문서 081 03장). 그림과 함께 컷마다 해설 · 대사가 와서 앱이 만화 뷰어로 그린다. 없으면 {@code null}
	 */
	public record PostDetail(String id, Author author, String title, String excerpt, Instant dreamRecordedAt,
			boolean hasComic, int likeCount, int commentCount, boolean likedByMe, Instant createdAt, boolean hidden,
			String dreamText, String body, String comicUrl, ComicAttachments.PostComic comic, List<Comment> comments) {
	}

	/**
	 * @param deleted 지웠거나 가려졌거나 내가 차단한 사람의 댓글인데 답글이 달려 있어 자리만 남긴 것. 이때 {@code body}는 빈 문자열
	 */
	public record Comment(String id, String postId, String parentId, Author author, String body, Instant createdAt,
			boolean deleted) {
	}

	public record Profile(String id, String nickname, Instant joinedAt, long postCount) {
	}

	public record Page<T>(List<T> items, String nextCursor) {
	}

	public record PostForDream(String postId) {
	}

	public record LikeState(int likeCount, boolean likedByMe) {
	}

	public record Blocks(List<Author> items) {
	}
}
