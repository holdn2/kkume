package com.kkume.server.comic;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

/** 만화 · 원가 테이블(V7). JPA 없이 SQL 로 — 줄에서 꺼내기({@code SKIP LOCKED})와 조건부 갱신이 대부분이라서다 */
@Repository
class ComicStore {

	record ComicRow(UUID id, UUID userId, String dreamId, String style, String status, String panels, String layout,
			String imageKey, String failCode, Instant createdAt, Instant finishedAt) {
	}

	/** 일꾼이 꺼낸 만화. 꿈 내용은 대본을 쓰는 동안만 들고 있다 */
	record Claimed(UUID id, UUID userId, String style, String title, String dreamText) {
	}

	/** 꿈 나눔에 붙일 수 있는 만화 */
	record Attachable(String layout, String imageKey, String panels) {
	}

	private static final String COLUMNS = """
			id, user_id, dream_id, style, status, panels, layout, image_key, fail_code, created_at, finished_at
			""";

	private static final RowMapper<ComicRow> ROW = (rs, n) -> new ComicRow(rs.getObject("id", UUID.class),
			rs.getObject("user_id", UUID.class), rs.getString("dream_id"), rs.getString("style"), rs.getString("status"),
			rs.getString("panels"), rs.getString("layout"), rs.getString("image_key"), rs.getString("fail_code"),
			instant(rs, "created_at"), instant(rs, "finished_at"));

	private final NamedParameterJdbcTemplate jdbc;

	ComicStore(NamedParameterJdbcTemplate jdbc) {
		this.jdbc = jdbc;
	}

	// ------------------------------------------------------------------ 앱 요청

	void insert(UUID id, UUID userId, String dreamId, String style, String title, String dreamText, Instant now) {
		this.jdbc.update("""
				insert into comics (id, user_id, dream_id, style, status, title, dream_text, created_at, updated_at)
				values (:id, :user, :dream, :style, 'queued', :title, :text, :now, :now)
				""", new MapSqlParameterSource("id", id).addValue("user", userId).addValue("dream", dreamId)
			.addValue("style", style).addValue("title", title).addValue("text", dreamText).addValue("now", time(now)));
	}

	Optional<ComicRow> findOwned(UUID id, UUID userId) {
		return this.jdbc.query("select " + COLUMNS + " from comics where id = :id and user_id = :user and deleted_at is null",
				new MapSqlParameterSource("id", id).addValue("user", userId), ROW).stream().findFirst();
	}

	List<ComicRow> forDream(UUID userId, String dreamId) {
		return this.jdbc.query("select " + COLUMNS + """
				from comics where user_id = :user and dream_id = :dream and deleted_at is null
				order by created_at desc, id desc
				""", new MapSqlParameterSource("user", userId).addValue("dream", dreamId), ROW);
	}

	/** 만드는 중인 내 만화. 지운 것은 일꾼이 버리므로 세지 않는다 */
	Optional<UUID> running(UUID userId) {
		return this.jdbc.queryForList("""
				select id from comics where user_id = :user and deleted_at is null
				  and status in ('queued', 'scripting', 'drawing')
				order by created_at desc limit 1
				""", new MapSqlParameterSource("user", userId), UUID.class).stream().findFirst();
	}

	/** 하루 몫으로 세는 내 만화. 거절 · 실패는 빼고 지운 것은 센다(081 02장) */
	long countForUserSince(UUID userId, Instant since) {
		return this.jdbc.queryForObject("""
				select count(*) from comics where user_id = :user and created_at >= :since
				  and status not in ('failed', 'refused')
				""", new MapSqlParameterSource("user", userId).addValue("since", time(since)), Long.class);
	}

	/** 서비스 전체 하루 몫. 실패도 센다 — 실패한 호출도 무료 한도를 쓴다 */
	long countSince(Instant since) {
		return this.jdbc.queryForObject("select count(*) from comics where created_at >= :since",
				new MapSqlParameterSource("since", time(since)), Long.class);
	}

	/** 오늘(UTC) Cloudflare 가 무료 한도 초과로 거절한 적이 있는가 */
	boolean budgetExhaustedSince(Instant since) {
		return Boolean.TRUE.equals(this.jdbc.queryForObject("""
				select exists (select 1 from comics where fail_code = 'budget' and finished_at >= :since)
				""", new MapSqlParameterSource("since", time(since)), Boolean.class));
	}

	/**
	 * 지운다. 하루 몫으로 세려고 행은 남기고 내용은 비운다.
	 *
	 * @return 지웠으면 지우기 전의 그림 키(그림이 없었으면 null)를 담은 값. 이미 지웠거나 남의 것이면 비어 있다
	 */
	Optional<Deleted> softDelete(UUID id, UUID userId, Instant now) {
		return this.jdbc.query("""
				update comics c set deleted_at = :now, updated_at = :now,
				  title = null, dream_text = null, scenes = null, panels = null, image_key = null
				from (select id, image_key from comics where id = :id and user_id = :user and deleted_at is null for update) old
				where c.id = old.id
				returning old.image_key
				""", new MapSqlParameterSource("id", id).addValue("user", userId).addValue("now", time(now)),
				(rs, n) -> new Deleted(rs.getString(1))).stream().findFirst();
	}

	record Deleted(String imageKey) {
	}

	Optional<Attachable> attachable(UUID id, UUID userId) {
		return this.jdbc.query("""
				select layout, image_key, panels from comics
				where id = :id and user_id = :user and deleted_at is null and status = 'done' and image_key is not null
				""", new MapSqlParameterSource("id", id).addValue("user", userId),
				(rs, n) -> new Attachable(rs.getString("layout"), rs.getString("image_key"), rs.getString("panels")))
			.stream().findFirst();
	}

	// ------------------------------------------------------------------ 일꾼

	/** 가장 오래 기다린 것을 scripting 으로 잡는다. 서버가 여럿이어도 같은 것을 둘이 잡지 않는다 */
	Optional<Claimed> claimNext(Instant now) {
		return this.jdbc.query("""
				update comics c set status = 'scripting', locked_at = :now, updated_at = :now
				from (select id from comics where status = 'queued' and deleted_at is null
				      order by created_at limit 1 for update skip locked) next
				where c.id = next.id
				returning c.id, c.user_id, c.style, c.title, c.dream_text
				""", new MapSqlParameterSource("now", time(now)),
				(rs, n) -> new Claimed(rs.getObject("id", UUID.class), rs.getObject("user_id", UUID.class),
						rs.getString("style"), rs.getString("title"), rs.getString("dream_text")))
			.stream().findFirst();
	}

	/** 대본을 적고 drawing 으로. 꿈 내용은 여기서 비운다. 그 사이 지웠으면 0 */
	int saveScript(UUID id, String panels, String scenes, Instant now) {
		return this.jdbc.update("""
				update comics set status = 'drawing', panels = :panels, scenes = :scenes, title = null, dream_text = null,
				  locked_at = :now, updated_at = :now
				where id = :id and status = 'scripting' and deleted_at is null
				""", new MapSqlParameterSource("id", id).addValue("panels", panels).addValue("scenes", scenes)
			.addValue("now", time(now)));
	}

	/** 다 그렸다. 그 사이 지웠거나(앱 · 계정 삭제) 멈춘 것으로 처리됐으면 0 — 부른 쪽이 올린 그림을 지운다 */
	int finishDone(UUID id, String layout, String imageKey, Instant now) {
		return this.jdbc.update("""
				update comics set status = 'done', layout = :layout, image_key = :key, scenes = null, locked_at = null,
				  finished_at = :now, updated_at = :now
				where id = :id and status = 'drawing' and deleted_at is null
				""", new MapSqlParameterSource("id", id).addValue("layout", layout).addValue("key", imageKey)
			.addValue("now", time(now)));
	}

	/** failed · refused 로 끝낸다. 남은 꿈 내용 · 장면도 비운다 */
	int finishFailure(UUID id, String status, String failCode, Instant now) {
		return this.jdbc.update("""
				update comics set status = :status, fail_code = :code, title = null, dream_text = null, scenes = null,
				  locked_at = null, finished_at = :now, updated_at = :now
				where id = :id and status in ('scripting', 'drawing')
				""", new MapSqlParameterSource("id", id).addValue("status", status).addValue("code", failCode)
			.addValue("now", time(now)));
	}

	/** 잡은 서버가 죽어 멈춘 만화를 실패로 끝낸다. 다시 그리지 않는다 — 실패는 하루 몫에서 빠지니 앱이 다시 만들면 된다 */
	int failStale(Instant lockedBefore, Instant now) {
		return this.jdbc.update("""
				update comics set status = 'failed', fail_code = 'interrupted', title = null, dream_text = null, scenes = null,
				  locked_at = null, finished_at = :now, updated_at = :now
				where status in ('scripting', 'drawing') and locked_at < :before
				""", new MapSqlParameterSource("before", time(lockedBefore)).addValue("now", time(now)));
	}

	void recordCost(UUID comicId, ComicAi.Usage usage, boolean ok, String error, Instant now) {
		this.jdbc.update("""
				insert into comic_costs (comic_id, step, model, ok, input_tokens, output_tokens, images, neurons, usd,
				  duration_ms, error, created_at)
				values (:comic, :step, :model, :ok, :in, :out, :images, :neurons, :usd, :ms, :error, :now)
				""", new MapSqlParameterSource("comic", comicId).addValue("step", usage.step()).addValue("model", usage.model())
			.addValue("ok", ok).addValue("in", usage.inputTokens()).addValue("out", usage.outputTokens())
			.addValue("images", usage.images()).addValue("neurons", ComicPricing.neurons(usage.usd()))
			.addValue("usd", usage.usd()).addValue("ms", (int) Math.min(Integer.MAX_VALUE, usage.durationMs()))
			.addValue("error", error).addValue("now", time(now)));
	}

	private static OffsetDateTime time(Instant instant) {
		return instant == null ? null : instant.truncatedTo(ChronoUnit.MICROS).atOffset(ZoneOffset.UTC);
	}

	private static Instant instant(ResultSet rs, String column) throws SQLException {
		OffsetDateTime t = rs.getObject(column, OffsetDateTime.class);
		return t == null ? null : t.toInstant();
	}
}
