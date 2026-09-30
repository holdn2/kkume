package com.kkume.server.community;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.kkume.server.community.CommunityStore.CommentRow;
import com.kkume.server.community.CommunityStore.PostRow;
import com.kkume.server.community.CommunityViews.Author;
import com.kkume.server.community.CommunityViews.Comment;
import com.kkume.server.community.CommunityViews.Page;
import com.kkume.server.community.CommunityViews.PostDetail;
import com.kkume.server.community.CommunityViews.PostSummary;
import com.kkume.server.community.CommunityViews.Profile;

/**
 * 커뮤니티 — 꿈 나눔. 계약은 문서 056(모바일 057에서 수용)이다.
 *
 * <p><b>글은 꿈의 복사본이다.</b> 앱이 보낸 제목 · 꿈 내용 · 꿈 꾼 시각을 그대로 저장하고 {@code dreams}는
 * 소유 확인에만 본다. 사용자가 올리기 전에 고친 값이 들어가며, 원래 꿈 기록은 비공개로 남는다.
 *
 * <p>{@code viewer}가 {@code null}이면 로그인하지 않은 사람이다. 읽기만 한다.
 */
@Service
public class CommunityService {

	static final int PAGE_SIZE = 20;

	static final int EXCERPT_LENGTH = 120;

	static final int MAX_TITLE = 255;

	static final int MAX_DREAM_TEXT = 20_000;

	static final int MAX_BODY = 2_000;

	static final int MAX_COMMENT = 500;

	/** 서로 다른 신고자가 이만큼 모이면 가린다(계획서 001 커뮤니티 최소 운영 장치) */
	static final int HIDE_AT_REPORTERS = 3;

	private static final Set<String> REPORT_REASONS = Set.of("sexual", "violence", "spam", "other");

	private final CommunityStore store;

	public CommunityService(CommunityStore store) {
		this.store = store;
	}

	// ------------------------------------------------------------------ 읽기

	@Transactional(readOnly = true)
	public Page<PostSummary> feed(UUID viewer, String sort, String cursor) {
		FeedSort feedSort = FeedSort.of(sort);
		List<PostRow> rows = this.store.feed(feedSort, FeedCursor.decode(cursor, feedSort), orNobody(viewer), PAGE_SIZE + 1);
		return page(rows, feedSort, viewer);
	}

	@Transactional(readOnly = true)
	public Page<PostSummary> postsBy(UUID viewer, String userId, String sort, String cursor) {
		UUID author = this.store.findActiveUser(parse(userId, CommunityApiException::userNotFound))
			.orElseThrow(CommunityApiException::userNotFound).id();
		FeedSort feedSort = FeedSort.of(sort);
		boolean self = author.equals(viewer);
		List<PostRow> rows = this.store.postsBy(author, self, feedSort, FeedCursor.decode(cursor, feedSort), PAGE_SIZE + 1);
		return page(rows, feedSort, viewer);
	}

	/**
	 * 글 상세. 지운 글은 누구에게나, 가려진 글은 작성자가 아니면 404다.
	 *
	 * <p>차단한 사람의 글이어도 준다 — 링크로 들어온 자리다. 댓글에서는 차단한 사람의 것을 거른다.
	 */
	@Transactional(readOnly = true)
	public PostDetail post(UUID viewer, String postId) {
		PostRow post = readable(viewer, this.store.findPost(parse(postId, CommunityApiException::postNotFound)).orElse(null));
		Set<UUID> blocked = viewer == null ? Set.of() : this.store.blockedBy(viewer);
		boolean liked = viewer != null && !this.store.likedAmong(viewer, List.of(post.id())).isEmpty();
		PostSummary s = summary(post, liked);
		return new PostDetail(s.id(), s.author(), s.title(), s.excerpt(), s.dreamRecordedAt(), s.hasComic(), s.likeCount(),
				s.commentCount(), s.likedByMe(), s.createdAt(), s.hidden(), post.dreamText(), post.body(), null,
				comments(this.store.commentsOf(post.id()), blocked));
	}

	/**
	 * 이 꿈으로 쓴 내 글. 가려진 글도 가리킨다 — 꿈 하나에 글 하나 규칙에서 "지우지 않은 글"로 세기 때문이다.
	 *
	 * <p>없는 꿈 · 남의 꿈이어도 {@code null}이다(문서 056 확정 1). 묻는 것이 "내 글"이라 답이 늘 참이고,
	 * 남의 꿈이 있는지는 드러나지 않는다. 꿈 상세는 아직 동기화되지 않은 꿈에서도 이것을 부른다.
	 */
	@Transactional(readOnly = true)
	public String postForDream(UUID viewer, String dreamId) {
		return this.store.findActivePostId(viewer, dreamId).map(UUID::toString).orElse(null);
	}

	/** 글 수는 지우지 않은 글. 남이 볼 때는 가려진 글을 뺀다 */
	@Transactional(readOnly = true)
	public Profile profile(UUID viewer, String userId) {
		CommunityStore.UserRow user = this.store.findActiveUser(parse(userId, CommunityApiException::userNotFound))
			.orElseThrow(CommunityApiException::userNotFound);
		long count = this.store.countPosts(user.id(), user.id().equals(viewer));
		return new Profile(user.id().toString(), user.nickname(), user.createdAt(), count);
	}

	// ------------------------------------------------------------------ 글쓰기

	public record NewPost(String dreamId, String title, String dreamText, Instant dreamRecordedAt, String body) {
	}

	@Transactional
	public PostSummary createPost(UUID viewer, NewPost input) {
		if (input == null) {
			throw CommunityApiException.badRequest("dream_text_empty", "꿈 내용을 적어 주세요");
		}
		String title = input.title() == null || input.title().isBlank() ? null : input.title();
		if (title != null && title.length() > MAX_TITLE) {
			throw CommunityApiException.badRequest("title_too_long", "제목은 255자까지입니다");
		}
		String dreamText = input.dreamText() == null ? "" : input.dreamText();
		if (dreamText.isBlank()) {
			throw CommunityApiException.badRequest("dream_text_empty", "꿈 내용을 적어 주세요");
		}
		if (dreamText.length() > MAX_DREAM_TEXT) {
			throw CommunityApiException.badRequest("dream_text_too_long", "꿈 내용은 20,000자까지입니다");
		}
		String body = input.body() == null ? "" : input.body();
		if (body.length() > MAX_BODY) {
			throw CommunityApiException.badRequest("body_too_long", "한마디는 2,000자까지입니다");
		}
		if (input.dreamRecordedAt() == null) {
			throw CommunityApiException.badRequest("missing_dream_recorded_at", "꿈을 꾼 시각이 없습니다");
		}
		String dreamId = input.dreamId() == null ? "" : input.dreamId();

		// 소유 확인만 한다. 서버에 아직 없으면 앱이 동기화한 뒤 다시 보낸다
		CommunityStore.DreamOwner owner = this.store.findDreamOwner(dreamId)
			.filter(d -> d.userId().equals(viewer))
			.orElseThrow(() -> new CommunityApiException(HttpStatus.NOT_FOUND, "dream_not_found", "서버에 없는 꿈입니다"));
		if (owner.deleted()) {
			throw new CommunityApiException(HttpStatus.CONFLICT, "dream_deleted", "지운 꿈입니다");
		}

		UUID id = UUID.randomUUID();
		Instant now = now();
		if (this.store.insertPost(id, viewer, dreamId, title, dreamText, input.dreamRecordedAt(), body, now) == 0) {
			throw alreadyShared(viewer, dreamId);
		}
		return summary(this.store.findPost(id).orElseThrow(), false);
	}

	private CommunityApiException alreadyShared(UUID viewer, String dreamId) {
		Map<String, Object> extra = new LinkedHashMap<>();
		this.store.findActivePostId(viewer, dreamId).ifPresent(p -> extra.put("postId", p.toString()));
		return new CommunityApiException(HttpStatus.CONFLICT, "already_shared", "이미 공유한 꿈입니다", extra);
	}

	/** 작성자는 가려진 글도 지울 수 있다. 지우면 같은 꿈을 다시 공유할 수 있다 */
	@Transactional
	public void deletePost(UUID viewer, String postId) {
		PostRow post = this.store.lockPost(parse(postId, CommunityApiException::postNotFound))
			.filter(p -> !p.isDeleted())
			.orElseThrow(CommunityApiException::postNotFound);
		if (!post.authorId().equals(viewer)) {
			if (post.isHidden()) {
				// 남에게 가려진 글은 "없는 글"이다. 있다는 것을 403으로 알려 주지 않는다
				throw CommunityApiException.postNotFound();
			}
			throw CommunityApiException.notOwner("내 글만 지울 수 있습니다");
		}
		this.store.deletePost(post.id(), now());
	}

	// ------------------------------------------------------------------ 공감

	/** 원하는 상태를 받는다. 두 번 보내도 한 번이다. 가려진 글은 작성자여도 받지 않는다 */
	@Transactional
	public CommunityViews.LikeState setLiked(UUID viewer, String postId, boolean liked) {
		PostRow post = interactable(this.store.lockPost(parse(postId, CommunityApiException::postNotFound)).orElse(null));
		if (liked) {
			this.store.like(post.id(), viewer, now());
		}
		else {
			this.store.unlike(post.id(), viewer);
		}
		return new CommunityViews.LikeState(this.store.recountLikes(post.id()), liked);
	}

	// ------------------------------------------------------------------ 댓글

	@Transactional
	public Comment addComment(UUID viewer, String postId, String body, String parentId) {
		String text = body == null ? "" : body.strip();
		if (text.isEmpty()) {
			throw CommunityApiException.badRequest("comment_empty", "댓글을 적어 주세요");
		}
		if (text.length() > MAX_COMMENT) {
			throw CommunityApiException.badRequest("comment_too_long", "댓글은 500자까지입니다");
		}
		PostRow post = interactable(this.store.lockPost(parse(postId, CommunityApiException::postNotFound)).orElse(null));

		UUID parent = null;
		if (parentId != null && !parentId.isBlank()) {
			CommentRow p = this.store.findComment(parse(parentId, CommunityApiException::commentNotFound))
				.filter(c -> c.postId().equals(post.id()) && !c.isGone())
				.orElseThrow(CommunityApiException::commentNotFound);
			if (p.parentId() != null) {
				throw CommunityApiException.badRequest("reply_depth", "답글에는 답글을 달 수 없습니다");
			}
			parent = p.id();
		}

		UUID id = UUID.randomUUID();
		Instant now = now();
		this.store.insertComment(id, post.id(), parent, viewer, text, now);
		this.store.recountComments(post.id());
		CommentRow row = this.store.findComment(id).orElseThrow();
		return new Comment(id.toString(), post.id().toString(), parent == null ? null : parent.toString(),
				new Author(viewer.toString(), row.authorNickname()), text, row.createdAt(), false);
	}

	@Transactional
	public void deleteComment(UUID viewer, String commentId) {
		CommentRow comment = this.store.findComment(parse(commentId, CommunityApiException::commentNotFound))
			.filter(c -> c.deletedAt() == null)
			.orElseThrow(CommunityApiException::commentNotFound);
		if (!comment.authorId().equals(viewer)) {
			throw CommunityApiException.notOwner("내 댓글만 지울 수 있습니다");
		}
		// 글을 먼저 잠근다. 댓글 쓰기 · 신고와 같은 순서라 서로 엇갈려 기다리지 않는다
		this.store.lockPost(comment.postId());
		this.store.deleteComment(comment.id(), now());
		this.store.recountComments(comment.postId());
	}

	// ------------------------------------------------------------------ 신고

	/**
	 * 같은 사람이 같은 대상을 다시 신고해도 한 번이다. 서로 다른 신고자가 3명이 되는 순간 같은 트랜잭션에서 가린다.
	 * 가린 뒤에는 풀리지 않는다 — 사람이 보는 관리 화면이 없다.
	 */
	@Transactional
	public void report(UUID viewer, String type, String targetId, String reason) {
		if (reason == null || !REPORT_REASONS.contains(reason)) {
			throw CommunityApiException.badRequest("invalid_report", "신고 사유가 올바르지 않습니다");
		}
		Instant now = now();
		if ("post".equals(type)) {
			PostRow post = this.store.lockPost(parse(targetId, CommunityApiException::postNotFound))
				.filter(p -> !p.isDeleted())
				.orElseThrow(CommunityApiException::postNotFound);
			if (post.authorId().equals(viewer)) {
				throw CommunityApiException.badRequest("self_report", "내 글은 신고할 수 없습니다");
			}
			this.store.report("post", post.id(), viewer, reason, now);
			if (this.store.countReporters("post", post.id()) >= HIDE_AT_REPORTERS) {
				this.store.hidePost(post.id(), now);
			}
			return;
		}
		if ("comment".equals(type)) {
			CommentRow comment = this.store.findComment(parse(targetId, CommunityApiException::commentNotFound))
				.filter(c -> c.deletedAt() == null)
				.orElseThrow(CommunityApiException::commentNotFound);
			if (comment.authorId().equals(viewer)) {
				throw CommunityApiException.badRequest("self_report", "내 댓글은 신고할 수 없습니다");
			}
			this.store.lockPost(comment.postId());
			this.store.report("comment", comment.id(), viewer, reason, now);
			if (this.store.countReporters("comment", comment.id()) >= HIDE_AT_REPORTERS) {
				this.store.hideComment(comment.id(), now);
				this.store.recountComments(comment.postId());
			}
			return;
		}
		throw CommunityApiException.badRequest("invalid_report", "신고 대상은 post · comment 중 하나입니다");
	}

	// ------------------------------------------------------------------ 차단

	@Transactional(readOnly = true)
	public List<Author> blocks(UUID viewer) {
		return this.store.blockList(viewer);
	}

	@Transactional
	public void block(UUID viewer, String userId) {
		UUID target = parse(userId, CommunityApiException::userNotFound);
		if (target.equals(viewer)) {
			throw CommunityApiException.badRequest("self_block", "나를 차단할 수 없습니다");
		}
		this.store.findActiveUser(target).orElseThrow(CommunityApiException::userNotFound);
		this.store.block(viewer, target, now());
	}

	/** 차단하지 않은 사람을 풀어도 아무 일도 없다 */
	@Transactional
	public void unblock(UUID viewer, String userId) {
		this.store.unblock(viewer, parse(userId, CommunityApiException::userNotFound));
	}

	// ------------------------------------------------------------------ 조립

	/** 지운 글은 누구에게나, 가려진 글은 작성자가 아니면 없는 글이다 */
	private static PostRow readable(UUID viewer, PostRow post) {
		if (post == null || post.isDeleted() || (post.isHidden() && !post.authorId().equals(viewer))) {
			throw CommunityApiException.postNotFound();
		}
		return post;
	}

	/** 공감 · 댓글은 보이는 글에만. 가려진 글은 작성자여도 받지 않는다 */
	private static PostRow interactable(PostRow post) {
		if (post == null || post.isDeleted() || post.isHidden()) {
			throw CommunityApiException.postNotFound();
		}
		return post;
	}

	private Page<PostSummary> page(List<PostRow> rows, FeedSort sort, UUID viewer) {
		boolean more = rows.size() > PAGE_SIZE;
		List<PostRow> shown = more ? rows.subList(0, PAGE_SIZE) : rows;
		Set<UUID> liked = viewer == null ? Set.of() : this.store.likedAmong(viewer, shown.stream().map(PostRow::id).toList());
		List<PostSummary> items = shown.stream().map(p -> summary(p, liked.contains(p.id()))).toList();
		String next = null;
		if (more) {
			PostRow last = shown.get(shown.size() - 1);
			next = new FeedCursor(sort, last.likeCount(), last.createdAt(), last.id()).encode();
		}
		return new Page<>(items, next);
	}

	private static PostSummary summary(PostRow p, boolean likedByMe) {
		return new PostSummary(p.id().toString(), new Author(p.authorId().toString(), p.authorNickname()), p.title(),
				excerpt(p.dreamText()), p.dreamRecordedAt(), false, p.likeCount(), p.commentCount(), likedByMe,
				p.createdAt(), p.isHidden());
	}

	/** 꿈 내용 앞 120자. 줄바꿈(과 그 둘레의 공백)은 공백 하나로. 두 줄 말줄임은 화면이 한다 */
	static String excerpt(String dreamText) {
		String flat = dreamText.replaceAll("\\s*\\R\\s*", " ").strip();
		if (flat.length() <= EXCERPT_LENGTH) {
			return flat;
		}
		int end = EXCERPT_LENGTH;
		// 이모지 같은 두 칸짜리 글자를 반으로 자르지 않는다
		if (Character.isHighSurrogate(flat.charAt(end - 1))) {
			end--;
		}
		return flat.substring(0, end);
	}

	/**
	 * 시간순, 답글은 부모 바로 뒤. 지웠거나 가려졌거나 차단한 사람의 댓글은 빠지는데,
	 * 보이는 답글이 달려 있으면 자리만 남긴다({@code deleted: true}, 본문은 비운다).
	 */
	private static List<Comment> comments(List<CommentRow> rows, Set<UUID> blocked) {
		Map<UUID, List<CommentRow>> replies = new LinkedHashMap<>();
		List<CommentRow> tops = new ArrayList<>();
		for (CommentRow c : rows) {
			if (c.parentId() == null) {
				tops.add(c);
			}
			else {
				replies.computeIfAbsent(c.parentId(), k -> new ArrayList<>()).add(c);
			}
		}
		List<Comment> out = new ArrayList<>();
		for (CommentRow top : tops) {
			List<Comment> shownReplies = replies.getOrDefault(top.id(), List.of()).stream()
				.filter(r -> visible(r, blocked))
				.map(r -> view(r, false))
				.toList();
			if (visible(top, blocked)) {
				out.add(view(top, false));
			}
			else if (!shownReplies.isEmpty()) {
				out.add(view(top, true));
			}
			else {
				continue;
			}
			out.addAll(shownReplies);
		}
		return out;
	}

	private static boolean visible(CommentRow c, Set<UUID> blocked) {
		return !c.isGone() && !blocked.contains(c.authorId());
	}

	private static Comment view(CommentRow c, boolean placeholder) {
		return new Comment(c.id().toString(), c.postId().toString(), c.parentId() == null ? null : c.parentId().toString(),
				new Author(c.authorId().toString(), c.authorNickname()), placeholder ? "" : c.body(), c.createdAt(),
				placeholder);
	}

	private static UUID orNobody(UUID viewer) {
		return viewer == null ? CommunityStore.NOBODY : viewer;
	}

	/** 경로의 id 가 UUID 가 아니면 "없는 것"이다. 400 으로 모양을 알려 주지 않는다 */
	private static UUID parse(String id, java.util.function.Supplier<CommunityApiException> notFound) {
		try {
			return UUID.fromString(id);
		}
		catch (IllegalArgumentException | NullPointerException ex) {
			throw notFound.get();
		}
	}

	/** DB 는 마이크로초까지 담는다. 그보다 잘게 두면 응답의 시각과 다음 쪽 커서가 어긋난다 */
	private static Instant now() {
		return Instant.now().truncatedTo(ChronoUnit.MICROS);
	}
}
