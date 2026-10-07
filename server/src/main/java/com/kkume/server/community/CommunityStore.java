package com.kkume.server.community;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.Collection;
import java.util.HashSet;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

/**
 * 커뮤니티 테이블(V4) 읽기 · 쓰기.
 *
 * <p><b>JPA 엔티티를 두지 않고 SQL 로만 다룬다.</b> 공감 수 · 댓글 수를 다시 세기, 신고 누적 가림,
 * 두 정렬의 키셋이 전부 {@code FOR UPDATE} · {@code ON CONFLICT} · 행 비교 같은 PostgreSQL 문법이고,
 * 한 트랜잭션 안에서 JPA 와 JDBC 를 섞으면 flush 시점 때문에 방금 쓴 것을 못 읽는 일이 생긴다.
 */
@Repository
class CommunityStore {

	/** 차단한 사람이 없는 "나"(로그인하지 않은 사람). 이 id 로 저장된 차단은 없다 */
	static final UUID NOBODY = new UUID(0, 0);

	private final NamedParameterJdbcTemplate jdbc;

	CommunityStore(NamedParameterJdbcTemplate jdbc) {
		this.jdbc = jdbc;
	}

	// ------------------------------------------------------------------ 글

	record PostRow(UUID id, UUID authorId, String authorNickname, String dreamId, String title, String dreamText,
			Instant dreamRecordedAt, String body, int likeCount, int commentCount, Instant hiddenAt, Instant deletedAt,
			Instant createdAt) {

		boolean isHidden() {
			return hiddenAt != null;
		}

		boolean isDeleted() {
			return deletedAt != null;
		}
	}

	private static final String POST_COLUMNS = """
			p.id, p.author_id, u.nickname, p.dream_id, p.title, p.dream_text, p.dream_recorded_at, p.body,
			p.like_count, p.comment_count, p.hidden_at, p.deleted_at, p.created_at
			""";

	private static final RowMapper<PostRow> POST = (rs, n) -> new PostRow(rs.getObject("id", UUID.class),
			rs.getObject("author_id", UUID.class), rs.getString("nickname"), rs.getString("dream_id"),
			rs.getString("title"), rs.getString("dream_text"), instant(rs, "dream_recorded_at"), rs.getString("body"),
			rs.getInt("like_count"), rs.getInt("comment_count"), instant(rs, "hidden_at"), instant(rs, "deleted_at"),
			instant(rs, "created_at"));

	Optional<PostRow> findPost(UUID id) {
		return this.jdbc.query("select " + POST_COLUMNS + " from posts p join users u on u.id = p.author_id where p.id = :id",
				new MapSqlParameterSource("id", id), POST).stream().findFirst();
	}

	/**
	 * 글 행을 잠근다. 공감 · 댓글 · 신고가 같은 글의 수를 다시 셀 때 서로 기다리게 해서,
	 * 두 요청이 각자 "나까지 센 수"를 덮어써 하나를 잃는 일을 막는다.
	 */
	Optional<PostRow> lockPost(UUID id) {
		return this.jdbc.query("select " + POST_COLUMNS
				+ " from posts p join users u on u.id = p.author_id where p.id = :id for update of p",
				new MapSqlParameterSource("id", id), POST).stream().findFirst();
	}

	Optional<UUID> findActivePostId(UUID authorId, String dreamId) {
		return this.jdbc.queryForList(
				"select id from posts where author_id = :author and dream_id = :dream and deleted_at is null",
				new MapSqlParameterSource("author", authorId).addValue("dream", dreamId), UUID.class).stream().findFirst();
	}

	/**
	 * 꿈 하나에 글 하나를 DB 가 지킨다. 겹친 요청이면 0을 돌려준다.
	 *
	 * <p>충돌을 예외로 받지 않고 {@code ON CONFLICT DO NOTHING}으로 받는다 — PostgreSQL 은 제약 위반이 난
	 * 트랜잭션에서 다음 문장을 거절하므로, 예외를 받은 뒤 "그 글이 무엇인지" 다시 물을 수 없다.
	 */
	int insertPost(UUID id, UUID authorId, String dreamId, String title, String dreamText, Instant dreamRecordedAt,
			String body, Instant now) {
		return this.jdbc.update("""
				insert into posts (id, author_id, dream_id, title, dream_text, dream_recorded_at, body, created_at, updated_at)
				values (:id, :author, :dream, :title, :text, :recorded, :body, :now, :now)
				on conflict (author_id, dream_id) where deleted_at is null do nothing
				""", new MapSqlParameterSource("id", id).addValue("author", authorId).addValue("dream", dreamId)
			.addValue("title", title).addValue("text", dreamText).addValue("recorded", time(dreamRecordedAt))
			.addValue("body", body).addValue("now", time(now)));
	}

	void deletePost(UUID id, Instant now) {
		this.jdbc.update("update posts set deleted_at = :now, updated_at = :now where id = :id",
				new MapSqlParameterSource("id", id).addValue("now", time(now)));
	}

	void hidePost(UUID id, Instant now) {
		this.jdbc.update("update posts set hidden_at = :now, updated_at = :now where id = :id and hidden_at is null",
				new MapSqlParameterSource("id", id).addValue("now", time(now)));
	}

	/**
	 * 피드. 지우지도 가리지도 않은 글 중 {@code viewer}가 차단하지 않은 사람의 것.
	 *
	 * @param after 이 위치 뒤부터. {@code null}이면 첫 쪽
	 */
	List<PostRow> feed(FeedSort sort, FeedCursor after, UUID viewer, int limit) {
		MapSqlParameterSource params = new MapSqlParameterSource("viewer", viewer).addValue("limit", limit);
		String sql = "select " + POST_COLUMNS + """
				from posts p join users u on u.id = p.author_id
				where p.deleted_at is null and p.hidden_at is null
				  and not exists (select 1 from user_blocks b where b.blocker_id = :viewer and b.blocked_id = p.author_id)
				""" + after(sort, after, params) + order(sort) + " limit :limit";
		return this.jdbc.query(sql, params, POST);
	}

	/**
	 * 한 사람의 글. 차단으로 거르지 않는다 — 일부러 찾아 들어온 자리다.
	 *
	 * @param includeHidden 작성자 본인이 볼 때만 {@code true}
	 */
	List<PostRow> postsBy(UUID authorId, boolean includeHidden, FeedSort sort, FeedCursor after, int limit) {
		MapSqlParameterSource params = new MapSqlParameterSource("author", authorId).addValue("limit", limit);
		String sql = "select " + POST_COLUMNS + """
				from posts p join users u on u.id = p.author_id
				where p.author_id = :author and p.deleted_at is null
				""" + (includeHidden ? "" : " and p.hidden_at is null ") + after(sort, after, params) + order(sort)
				+ " limit :limit";
		return this.jdbc.query(sql, params, POST);
	}

	private static String after(FeedSort sort, FeedCursor after, MapSqlParameterSource params) {
		if (after == null) {
			return "";
		}
		params.addValue("afterAt", time(after.createdAt())).addValue("afterId", after.id());
		if (sort == FeedSort.EMPATHY) {
			params.addValue("afterLikes", after.likeCount());
			return " and (p.like_count, p.created_at, p.id) < (:afterLikes, :afterAt, :afterId) ";
		}
		return " and (p.created_at, p.id) < (:afterAt, :afterId) ";
	}

	private static String order(FeedSort sort) {
		return sort == FeedSort.EMPATHY ? " order by p.like_count desc, p.created_at desc, p.id desc"
				: " order by p.created_at desc, p.id desc";
	}

	long countPosts(UUID authorId, boolean includeHidden) {
		Long count = this.jdbc.queryForObject("select count(*) from posts where author_id = :author and deleted_at is null"
				+ (includeHidden ? "" : " and hidden_at is null"), new MapSqlParameterSource("author", authorId), Long.class);
		return count == null ? 0 : count;
	}

	// ------------------------------------------------------------------ 공감

	/** 이미 눌렀으면 아무 일도 없다 — 앱은 뒤집기가 아니라 원하는 상태를 보낸다 */
	void like(UUID postId, UUID userId, Instant now) {
		this.jdbc.update("insert into post_likes (post_id, user_id, created_at) values (:post, :user, :now) on conflict do nothing",
				new MapSqlParameterSource("post", postId).addValue("user", userId).addValue("now", time(now)));
	}

	void unlike(UUID postId, UUID userId) {
		this.jdbc.update("delete from post_likes where post_id = :post and user_id = :user",
				new MapSqlParameterSource("post", postId).addValue("user", userId));
	}

	/** 더하고 빼지 않고 다시 센다. 수가 한 번 틀어지면 더하고 빼는 방식은 영영 틀린 채로 남는다 */
	int recountLikes(UUID postId) {
		Integer count = this.jdbc.queryForObject("""
				update posts set like_count = (select count(*) from post_likes where post_id = :post)
				where id = :post returning like_count
				""", new MapSqlParameterSource("post", postId), Integer.class);
		return count == null ? 0 : count;
	}

	Set<UUID> likedAmong(UUID userId, Collection<UUID> postIds) {
		if (postIds.isEmpty()) {
			return Set.of();
		}
		return new HashSet<>(this.jdbc.queryForList("select post_id from post_likes where user_id = :user and post_id in (:posts)",
				new MapSqlParameterSource("user", userId).addValue("posts", postIds), UUID.class));
	}

	// ------------------------------------------------------------------ 댓글

	record CommentRow(UUID id, UUID postId, UUID parentId, UUID authorId, String authorNickname, String body,
			Instant hiddenAt, Instant deletedAt, Instant createdAt) {

		boolean isGone() {
			return hiddenAt != null || deletedAt != null;
		}
	}

	private static final RowMapper<CommentRow> COMMENT = (rs, n) -> new CommentRow(rs.getObject("id", UUID.class),
			rs.getObject("post_id", UUID.class), rs.getObject("parent_id", UUID.class),
			rs.getObject("author_id", UUID.class), rs.getString("nickname"), rs.getString("body"),
			instant(rs, "hidden_at"), instant(rs, "deleted_at"), instant(rs, "created_at"));

	private static final String COMMENT_COLUMNS = """
			c.id, c.post_id, c.parent_id, c.author_id, u.nickname, c.body, c.hidden_at, c.deleted_at, c.created_at
			""";

	Optional<CommentRow> findComment(UUID id) {
		return this.jdbc.query("select " + COMMENT_COLUMNS + " from comments c join users u on u.id = c.author_id where c.id = :id",
				new MapSqlParameterSource("id", id), COMMENT).stream().findFirst();
	}

	/** 한 글의 댓글 전부. 지운 것 · 가려진 것도 온다 — 답글이 달려 있으면 자리를 남겨야 해서다 */
	List<CommentRow> commentsOf(UUID postId) {
		return this.jdbc.query("select " + COMMENT_COLUMNS
				+ " from comments c join users u on u.id = c.author_id where c.post_id = :post order by c.created_at, c.id",
				new MapSqlParameterSource("post", postId), COMMENT);
	}

	void insertComment(UUID id, UUID postId, UUID parentId, UUID authorId, String body, Instant now) {
		this.jdbc.update("""
				insert into comments (id, post_id, parent_id, author_id, body, created_at)
				values (:id, :post, :parent, :author, :body, :now)
				""", new MapSqlParameterSource("id", id).addValue("post", postId).addValue("parent", parentId)
			.addValue("author", authorId).addValue("body", body).addValue("now", time(now)));
	}

	void deleteComment(UUID id, Instant now) {
		this.jdbc.update("update comments set deleted_at = :now where id = :id",
				new MapSqlParameterSource("id", id).addValue("now", time(now)));
	}

	void hideComment(UUID id, Instant now) {
		this.jdbc.update("update comments set hidden_at = :now where id = :id and hidden_at is null",
				new MapSqlParameterSource("id", id).addValue("now", time(now)));
	}

	void recountComments(UUID postId) {
		this.jdbc.update("""
				update posts set comment_count = (
				  select count(*) from comments where post_id = :post and deleted_at is null and hidden_at is null)
				where id = :post
				""", new MapSqlParameterSource("post", postId));
	}

	// ------------------------------------------------------------------ 신고

	/** 새로 들어간 신고면 1, 같은 사람이 같은 대상을 다시 신고했으면 0 */
	int report(String targetType, UUID targetId, UUID reporterId, String reason, Instant now) {
		return this.jdbc.update("""
				insert into reports (id, target_type, target_id, reporter_id, reason, created_at)
				values (:id, :type, :target, :reporter, :reason, :now)
				on conflict (target_type, target_id, reporter_id) do nothing
				""", new MapSqlParameterSource("id", UUID.randomUUID()).addValue("type", targetType)
			.addValue("target", targetId).addValue("reporter", reporterId).addValue("reason", reason)
			.addValue("now", time(now)));
	}

	int countReporters(String targetType, UUID targetId) {
		Integer count = this.jdbc.queryForObject("select count(*) from reports where target_type = :type and target_id = :target",
				new MapSqlParameterSource("type", targetType).addValue("target", targetId), Integer.class);
		return count == null ? 0 : count;
	}

	// ------------------------------------------------------------------ 차단

	void block(UUID blocker, UUID blocked, Instant now) {
		this.jdbc.update("insert into user_blocks (blocker_id, blocked_id, created_at) values (:blocker, :blocked, :now) on conflict do nothing",
				new MapSqlParameterSource("blocker", blocker).addValue("blocked", blocked).addValue("now", time(now)));
	}

	void unblock(UUID blocker, UUID blocked) {
		this.jdbc.update("delete from user_blocks where blocker_id = :blocker and blocked_id = :blocked",
				new MapSqlParameterSource("blocker", blocker).addValue("blocked", blocked));
	}

	Set<UUID> blockedBy(UUID blocker) {
		return new HashSet<>(this.jdbc.queryForList("select blocked_id from user_blocks where blocker_id = :blocker",
				new MapSqlParameterSource("blocker", blocker), UUID.class));
	}

	List<CommunityViews.Author> blockList(UUID blocker) {
		return this.jdbc.query("""
				select u.id, u.nickname from user_blocks b join users u on u.id = b.blocked_id
				where b.blocker_id = :blocker order by b.created_at desc
				""", new MapSqlParameterSource("blocker", blocker),
				(rs, n) -> new CommunityViews.Author(rs.getObject("id", UUID.class).toString(), rs.getString("nickname")));
	}

	// ------------------------------------------------------------------ 사용자 · 꿈

	record UserRow(UUID id, String nickname, Instant createdAt) {
	}

	/** 탈퇴한 사용자는 없는 것으로 본다 */
	Optional<UserRow> findActiveUser(UUID id) {
		return this.jdbc.query("select id, nickname, created_at from users where id = :id and deleted_at is null",
				new MapSqlParameterSource("id", id),
				(rs, n) -> new UserRow(rs.getObject("id", UUID.class), rs.getString("nickname"), instant(rs, "created_at")))
			.stream().findFirst();
	}

	record DreamOwner(UUID userId, boolean deleted) {
	}

	/** 글쓰기의 소유 확인에만 쓴다. 꿈의 내용은 읽지 않는다 — 글은 앱이 보낸 복사본을 쓴다 */
	Optional<DreamOwner> findDreamOwner(String dreamId) {
		return this.jdbc.query("select user_id, deleted_at from dreams where id = :id", new MapSqlParameterSource("id", dreamId),
				(rs, n) -> new DreamOwner(rs.getObject("user_id", UUID.class), rs.getObject("deleted_at") != null))
			.stream().findFirst();
	}

	// ------------------------------------------------------------------ 시각

	private static Instant instant(ResultSet rs, String column) throws SQLException {
		OffsetDateTime value = rs.getObject(column, OffsetDateTime.class);
		return value == null ? null : value.toInstant();
	}

	private static OffsetDateTime time(Instant instant) {
		return instant == null ? null : instant.atOffset(ZoneOffset.UTC);
	}
}
