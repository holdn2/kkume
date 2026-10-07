package com.kkume.server.user;

import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.UUID;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

import com.kkume.server.audio.AudioStorage;

/**
 * 계정 삭제(MY-5). 계약은 문서 064 · 066(모바일 065에서 수용)이다.
 *
 * <p><b>폰의 기록은 남고 서버의 기록은 지운다</b>(사용자 결정). 유예 없이 그 자리에서 지운다 — 다시 로그인하면 새 계정이라
 * 유예 동안 되살릴 길이 없고, 원본은 폰에 있어 서버 사본을 지워도 잃는 것이 없다.
 *
 * <ul>
 * <li>지운다: 꿈 기록 · 변환 작업 · 설정 · S3 녹음 · 내 공감 · 차단(양방향)
 * <li>비운다: 내 글 · 댓글 — "지운 것"으로 두고 내용을 비운다. 남의 댓글 · 공감 · 신고가 가리키는 행이라 실제로 지우지 않는다
 * <li>남긴다: 신고(가려진 것이 풀리지 않게) · 사용자 행 — 대신 다시 알아볼 수 없게 익명화한다
 * </ul>
 */
@Service
public class AccountDeletionService {

	private static final Logger log = LoggerFactory.getLogger(AccountDeletionService.class);

	/** 지운 계정의 닉네임. 살아 있는 사람은 이 이름을 못 쓴다({@link UserService#rename}) */
	public static final String DELETED_NICKNAME = "탈퇴한 사용자";

	/** 삭제 전에 받은 업로드 URL 은 15분 동안 살아 있다. 그보다 넉넉히 다시 쓸어 낸다 */
	static final long SWEEP_WINDOW_HOURS = 24;

	private final NamedParameterJdbcTemplate jdbc;

	private final TransactionTemplate transactions;

	private final AudioStorage audio;

	public AccountDeletionService(NamedParameterJdbcTemplate jdbc, TransactionTemplate transactions, AudioStorage audio) {
		this.jdbc = jdbc;
		this.transactions = transactions;
		this.audio = audio;
	}

	/**
	 * 지운다. 이미 지운 계정이면 아무 일도 없다(그런 토큰은 보통 여기까지 오지 못하고 {@code 401 account_deleted}로 막힌다).
	 *
	 * <p><b>S3 를 먼저, DB 를 나중에.</b> S3 에서 실패하면 DB 를 건드리지 않고 던진다 — 계정은 그대로라 다시 누를 수 있다.
	 * 반대 순서면 계정은 지워졌는데 녹음이 남고, 그 녹음을 지울 계정이 더는 없다.
	 *
	 * @throws DeletionFailedException S3 에서 못 지움. 아무것도 지우지 않았다
	 */
	public void delete(UUID userId) {
		String prefix = audioPrefix(userId);
		try {
			this.audio.deleteAll(prefix);
		}
		catch (RuntimeException ex) {
			log.warn("계정 삭제 — 녹음 삭제 실패, 아무것도 지우지 않음 user={}", userId, ex);
			throw new DeletionFailedException();
		}

		this.transactions.executeWithoutResult(status -> deleteRows(userId));

		// 삭제 직전에 받은 URL 로 그 사이 올라온 것. 여기서 실패해도 쓸어 내기가 받는다
		try {
			this.audio.deleteAll(prefix);
		}
		catch (RuntimeException ex) {
			log.warn("계정 삭제 — 뒤늦은 녹음 정리 실패, 쓸어 내기에 맡김 user={}", userId, ex);
		}
	}

	private void deleteRows(UUID userId) {
		MapSqlParameterSource p = new MapSqlParameterSource("user", userId)
			.addValue("now", OffsetDateTime.now(ZoneOffset.UTC).truncatedTo(ChronoUnit.MICROS));

		// 쓰기들과 줄을 선다(AccountGuard). 쓰기가 잡고 있으면 그 커밋을 기다렸다가 방금 쓴 것까지 지운다
		List<Boolean> deleted = this.jdbc.queryForList("select deleted_at is not null from users where id = :user for update",
				p, Boolean.class);
		if (deleted.isEmpty() || deleted.get(0)) {
			return;
		}

		// 변환 작업이 꿈을 가리키므로 먼저
		this.jdbc.update("delete from jobs where user_id = :user", p);
		this.jdbc.update("delete from dreams where user_id = :user", p);
		this.jdbc.update("delete from user_settings where user_id = :user", p);

		List<UUID> liked = this.jdbc.queryForList("delete from post_likes where user_id = :user returning post_id", p, UUID.class);
		if (!liked.isEmpty()) {
			this.jdbc.update("""
					update posts set like_count = (select count(*) from post_likes l where l.post_id = posts.id)
					where id in (:posts)
					""", new MapSqlParameterSource("posts", liked));
		}

		List<UUID> commented = this.jdbc.queryForList("""
				update comments set deleted_at = coalesce(deleted_at, :now), body = ''
				where author_id = :user returning post_id
				""", p, UUID.class);
		if (!commented.isEmpty()) {
			this.jdbc.update("""
					update posts set comment_count = (
					  select count(*) from comments c where c.post_id = posts.id and c.deleted_at is null and c.hidden_at is null)
					where id in (:posts)
					""", new MapSqlParameterSource("posts", commented.stream().distinct().toList()));
		}

		this.jdbc.update("""
				update posts set deleted_at = coalesce(deleted_at, :now), title = null, dream_text = '', body = '', updated_at = :now
				where author_id = :user
				""", p);
		this.jdbc.update("delete from user_blocks where blocker_id = :user or blocked_id = :user", p);

		// 구글 계정과의 연결을 끊는다. 그대로 두면 같은 구글 계정으로 로그인할 때 지운 계정이 되살아난다
		this.jdbc.update("""
				update users set provider_id = :anon, nickname = :nickname, deleted_at = :now, updated_at = :now,
				  consent_version = null, consented_at = null, suspended_at = null
				where id = :user
				""", p.addValue("anon", "deleted:" + UUID.randomUUID()).addValue("nickname", DELETED_NICKNAME));
	}

	/**
	 * 삭제 직전에 받은 업로드 URL 로 삭제 뒤에 올라온 녹음을 지운다. URL 은 S3 가 검사해서 서버가 막을 수 없다(문서 066).
	 *
	 * <p>할 일 목록은 {@code users.deleted_at}이다 — 따로 예약 테이블을 두지 않아 서버가 재시작돼도 잃지 않는다.
	 * 최근에 지운 계정이 없으면 S3 를 부르지 않는다.
	 */
	@Scheduled(fixedDelayString = "${kkume.account.audio-sweep:10m}", initialDelayString = "${kkume.account.audio-sweep:10m}")
	public void sweepAudio() {
		Instant since = Instant.now().minus(SWEEP_WINDOW_HOURS, ChronoUnit.HOURS);
		List<UUID> recent = this.jdbc.queryForList("select id from users where deleted_at > :since",
				new MapSqlParameterSource("since", since.atOffset(ZoneOffset.UTC)), UUID.class);
		for (UUID userId : recent) {
			try {
				this.audio.deleteAll(audioPrefix(userId));
			}
			catch (RuntimeException ex) {
				log.warn("지운 계정의 녹음 쓸어 내기 실패 user={} — 다음 차례에 다시", userId, ex);
			}
		}
	}

	/** 녹음 키의 사용자 몫. 키 모양은 {@code AudioService.prefix}와 같다 */
	static String audioPrefix(UUID userId) {
		return "audio/" + userId + "/";
	}

	/** S3 에서 못 지웠다. 아무것도 지우지 않았으니 다시 누르면 된다 */
	public static class DeletionFailedException extends RuntimeException {

		public DeletionFailedException() {
			super("지금은 계정을 삭제하지 못했습니다. 잠시 뒤 다시 시도해 주세요");
		}
	}
}
