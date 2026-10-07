package com.kkume.server.user;

import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import com.kkume.server.moderation.ModerationProperties;

/**
 * 계정이 살아 있는지 본다.
 *
 * <p>토큰 검사는 요청이 시작할 때 한 번뿐이다. 그 뒤 계정 삭제가 끝나고 나서 커밋하는 쓰기는 지운 것을 되살린다 —
 * 꿈 기록이 다시 생기고, 익명화한 닉네임이 원래 이름으로 덮인다(문서 066 01장).
 * 그래서 <b>쓰기 트랜잭션은 맨 처음 {@link #lockActive}를 부른다.</b>
 */
@Component
public class AccountGuard {

	private final JdbcTemplate jdbc;

	private final ModerationProperties moderation;

	public AccountGuard(JdbcTemplate jdbc, ModerationProperties moderation) {
		this.jdbc = jdbc;
		this.moderation = moderation;
	}

	/**
	 * {@link #lockActive}에 더해 이용 정지도 본다. 남에게 보이는 것을 만드는 쓰기 — 글 · 댓글 · 공감 · 닉네임 — 가 부른다.
	 * 신고 · 차단 · 내 꿈 동기화 · 동의 · 계정 삭제는 정지돼도 되므로 {@link #lockActive}만 부른다(문서 072 03장).
	 */
	public void lockWritable(UUID userId) {
		List<Map<String, Object>> rows = this.jdbc.queryForList(
				"select deleted_at is not null as deleted, suspended_at is not null as suspended from users where id = ? for share",
				userId);
		if (rows.isEmpty() || Boolean.TRUE.equals(rows.get(0).get("deleted"))) {
			throw new AccountDeletedException();
		}
		if (Boolean.TRUE.equals(rows.get(0).get("suspended"))) {
			throw new AccountSuspendedException(this.moderation.contact());
		}
	}

	/**
	 * 사용자 행을 {@code FOR SHARE}로 잡고 지워졌는지 본다. 트랜잭션 안에서 불러야 잠금이 뜻이 있다.
	 *
	 * <p>계정 삭제는 같은 행을 {@code FOR UPDATE}로 잡으므로 둘이 줄을 선다. 쓰기가 먼저 잡았으면 삭제가 그 커밋을
	 * 기다렸다가 방금 쓴 것까지 지우고, 삭제가 먼저 잡았으면 쓰기가 기다렸다가 커밋된 {@code deleted_at}을 보고 여기서 멈춘다.
	 */
	public void lockActive(UUID userId) {
		List<Boolean> deleted = this.jdbc.queryForList(
				"select deleted_at is not null from users where id = ? for share", Boolean.class, userId);
		if (deleted.isEmpty() || deleted.get(0)) {
			throw new AccountDeletedException();
		}
	}

	/** 잠그지 않고 본다. 요청마다 토큰의 계정을 확인하는 데 쓴다 — 읽기는 되살릴 것이 없어 잠글 필요가 없다 */
	public boolean isActive(UUID userId) {
		List<Boolean> deleted = this.jdbc.queryForList("select deleted_at is not null from users where id = ?",
				Boolean.class, userId);
		return !deleted.isEmpty() && !deleted.get(0);
	}
}
