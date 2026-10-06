package com.kkume.server.dream;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;

import com.kkume.server.user.AccountGuard;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * 기기의 로컬 SQLite 와 서버를 맞춘다.
 *
 * <p>이 프로젝트에서 <b>기록이 조용히 사라질 수 있는 유일한 지점</b>이라,
 * 애매하면 지우지 않는 쪽으로 판단한다.
 */
@Service
public class SyncService {

	/** 한 번에 받을 수 있는 최대 건수. 넘으면 기기가 나눠 보낸다. */
	public static final int MAX_BATCH = 100;

	/** 한 번에 내려보낼 최대 건수. */
	public static final int MAX_PAGE = 100;

	private static final int MAX_ID_LENGTH = 64;

	private static final int MAX_TITLE_LENGTH = 255;

	private final DreamRepository dreams;

	private final TransactionTemplate transactions;

	private final AccountGuard accounts;

	public SyncService(DreamRepository dreams, TransactionTemplate transactions, AccountGuard accounts) {
		this.accounts = accounts;
		this.dreams = dreams;
		this.transactions = transactions;
	}

	/**
	 * {@code since} 이후 바뀐 기록을 순서대로 준다. 지워진 것도 함께 간다.
	 *
	 * <p>다음 요청은 응답의 {@code nextSince} 와 {@code nextCursor} 를 그대로 돌려주면 된다.
	 * 둘을 함께 주는 이유는 같은 시각의 기록이 여럿일 때 경계에서 한 건이 빠지지 않게 하기 위해서다.
	 */
	@Transactional(readOnly = true)
	public Page pull(UUID userId, Instant since, String cursor, int limit) {
		int size = Math.clamp(limit, 1, MAX_PAGE);
		// 한 건 더 받아 보고 남은 게 있는지 판단한다. 개수를 따로 세면 같은 조건을 두 번 훑는다.
		List<Dream> found = this.dreams.findChangedSince(userId, since, cursor, PageRequest.of(0, size + 1));

		boolean hasMore = found.size() > size;
		List<Dream> page = hasMore ? found.subList(0, size) : found;

		List<DreamView> views = new ArrayList<>(page.size());
		for (Dream dream : page) {
			views.add(DreamView.of(dream));
		}
		if (page.isEmpty()) {
			// 받을 것이 없으면 커서를 그대로 돌려준다. 여기서 초기화하면
			// 다음 요청이 처음부터 다시 받아 온다.
			return new Page(views, since, cursor, false);
		}
		Dream last = page.get(page.size() - 1);
		return new Page(views, last.getUpdatedAt(), last.getId(), hasMore);
	}

	/**
	 * 기기가 올린 기록들을 반영한다. <b>한 건씩 따로 커밋한다.</b>
	 *
	 * <p>하나로 묶으면 한 건이 잘못됐을 때 나머지까지 되돌아가고, 기기는 그 한 건을
	 * 고치기 전까지 아무것도 올리지 못한다. 오프라인에 쌓인 기록이 갇히는 경로다.
	 */
	public List<SyncResult> push(UUID userId, List<DreamPayload> payloads) {
		if (payloads.size() > MAX_BATCH) {
			throw new BatchTooLargeException(payloads.size());
		}
		List<SyncResult> results = new ArrayList<>(payloads.size());
		for (DreamPayload payload : payloads) {
			results.add(this.transactions.execute(status -> applyOne(userId, payload)));
		}
		return results;
	}

	private SyncResult applyOne(UUID userId, DreamPayload payload) {
		// 기록마다 다시 본다. 삭제가 끝난 뒤 커밋하면 지운 꿈이 되살아난다(문서 066)
		this.accounts.lockActive(userId);
		String reason = validate(payload);
		if (reason != null) {
			return SyncResult.rejected(payload == null ? null : payload.id(), reason);
		}

		Instant now = Instant.now();
		Optional<Dream> existing = this.dreams.findById(payload.id());
		if (existing.isEmpty()) {
			Dream created = new Dream(payload.id(), userId, payload.recordedAt(), now);
			apply(created, payload, now);
			this.dreams.save(created);
			return SyncResult.saved(payload.id());
		}

		Dream dream = existing.get();
		if (!dream.getUserId().equals(userId)) {
			// 남의 기록이다. 덮어쓰지도, 있다는 사실을 자세히 알려주지도 않는다.
			return SyncResult.rejected(payload.id(), "not_owned");
		}
		if (!dream.isOlderThan(payload.updatedAt())) {
			return SyncResult.skipped(payload.id());
		}
		apply(dream, payload, now);
		this.dreams.save(dream);
		return SyncResult.saved(payload.id());
	}

	/**
	 * <b>audioUrl 과 sttStatus 는 건드리지 않는다.</b> 기기가 모르는 값이라
	 * 여기서 반영하면 이미 올라간 원본 주소가 지워지고, STT 실패가 곧 기록 소실이 된다.
	 */
	private static void apply(Dream dream, DreamPayload payload, Instant now) {
		dream.apply(payload.title(), payload.text(), payload.durationMs(), payload.recordedAt(),
				payload.reviewedAt(), payload.deletedAt(), payload.updatedAt(), now);
	}

	/** 받을 수 없는 이유를 돌려준다. 받을 수 있으면 {@code null}. */
	private static String validate(DreamPayload payload) {
		if (payload == null || payload.id() == null || payload.id().isBlank()) {
			return "missing_id";
		}
		if (payload.id().length() > MAX_ID_LENGTH) {
			return "id_too_long";
		}
		if (payload.recordedAt() == null) {
			return "missing_recorded_at";
		}
		if (payload.updatedAt() == null) {
			// 이것이 없으면 어느 쪽이 최신인지 판정할 수 없다. 추측해서 덮어쓰지 않는다.
			return "missing_updated_at";
		}
		if (payload.title() != null && payload.title().length() > MAX_TITLE_LENGTH) {
			// 잘라서 저장하지 않는다. 사용자가 쓴 것이 조용히 사라진다.
			return "title_too_long";
		}
		return null;
	}

	/**
	 * @param nextSince 다음 요청의 {@code since}
	 * @param nextCursor 다음 요청의 {@code cursor}
	 * @param hasMore 아직 남은 것이 있으면 기기는 곧바로 한 번 더 부른다
	 */
	public record Page(List<DreamView> dreams, Instant nextSince, String nextCursor, boolean hasMore) {
	}

	/** 기기가 나눠 보내야 한다. 일부만 처리하면 나머지를 조용히 버리게 된다. */
	public static class BatchTooLargeException extends RuntimeException {

		public BatchTooLargeException(int size) {
			super("한 번에 " + MAX_BATCH + "건까지 보낼 수 있습니다. 받은 것: " + size);
		}
	}
}
