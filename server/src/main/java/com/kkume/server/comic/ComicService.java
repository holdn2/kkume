package com.kkume.server.comic;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.json.JsonMapper;

import com.kkume.server.comic.ComicScript.Panel;
import com.kkume.server.comic.ComicStore.ComicRow;
import com.kkume.server.user.AccountDeletedException;
import com.kkume.server.user.AccountGuard;

/**
 * 꿈 만화 — 만들기 부탁 · 상태 읽기 · 지우기. 계약은 문서 081 01 · 02장이다.
 *
 * <p>여기서는 줄에 넣기만 한다. 대본 · 그림은 {@link ComicWorker}가 트랜잭션 밖에서 만든다.
 * 앱은 2초마다 {@code GET /api/comics/{id}}로 단계를 읽는다.
 */
@Service
public class ComicService {

	private static final Logger log = LoggerFactory.getLogger(ComicService.class);

	static final int MAX_DREAM_TEXT = 20_000;

	static final int MAX_TITLE = 255;

	static final int MAX_DREAM_ID = 64;

	private static final Set<String> STYLES = Set.of("soft", "ink");

	private static final ZoneId KST = ZoneId.of("Asia/Seoul");

	static final String REFUSED_MESSAGE = "이 꿈은 만화로 만들 수 없어요. 다른 꿈으로 만들어 보세요.";

	static final String FAILED_MESSAGE = "만화를 만들지 못했습니다. 잠시 뒤 다시 만들어 주세요.";

	static final String BUDGET_MESSAGE = "오늘 만화가 마감됐어요. 내일 다시 만들어 주세요.";

	private static final TypeReference<List<Panel>> PANELS = new TypeReference<>() {
	};

	private final ComicStore store;

	private final ComicStorage storage;

	private final ComicAi ai;

	private final ComicProperties properties;

	private final AccountGuard accounts;

	private final JdbcTemplate jdbc;

	private final JsonMapper json;

	public ComicService(ComicStore store, ComicStorage storage, ComicAi ai, ComicProperties properties,
			AccountGuard accounts, JdbcTemplate jdbc, JsonMapper json) {
		this.store = store;
		this.storage = storage;
		this.ai = ai;
		this.properties = properties;
		this.accounts = accounts;
		this.jdbc = jdbc;
		this.json = json;
	}

	/** 앱에 보내는 만화(081 02장). {@code imageUrls}는 짧게 사는 주소라 앱이 저장하지 않는다 */
	public record ComicView(String id, String dreamId, String style, String status, String layout,
			List<String> imageUrls, List<Panel> panels, String failMessage, Instant createdAt, Instant finishedAt) {
	}

	public record NewComic(String dreamId, String title, String dreamText, String style) {
	}

	/**
	 * 만들기를 부탁한다. 판정 순서: 본문 모양(400) → 만들 수 있는 서버인가(503) → 만드는 중(409) → 서비스 하루 몫(503)
	 * → 1인 하루 몫(429).
	 */
	@Transactional
	public ComicView create(UUID userId, NewComic input) {
		// 사용자 행을 처음부터 FOR UPDATE 로 잡아 같은 사람의 두 요청이 줄을 서게 한다 — 둘 다 "만드는 중 없음 · 오늘 0편"을
		// 보고 함께 들어오지 않게. FOR SHARE(lockActive)로 잡은 뒤 올리면 두 요청이 서로의 SHARE 를 기다려 교착된다
		List<Boolean> deleted = this.jdbc.queryForList("select deleted_at is not null from users where id = ? for update",
				Boolean.class, userId);
		if (deleted.isEmpty() || deleted.get(0)) {
			throw new AccountDeletedException();
		}

		if (input == null || input.style() == null || !STYLES.contains(input.style())) {
			throw ComicApiException.invalidInput();
		}
		String text = input.dreamText() == null ? "" : input.dreamText().strip();
		String dreamId = input.dreamId() == null ? "" : input.dreamId().strip();
		if (text.isEmpty() || text.length() > MAX_DREAM_TEXT || dreamId.isEmpty() || dreamId.length() > MAX_DREAM_ID) {
			throw ComicApiException.invalidInput();
		}
		String title = input.title() == null || input.title().isBlank() ? null : input.title().strip();
		if (title != null && title.length() > MAX_TITLE) {
			throw ComicApiException.invalidInput();
		}
		if (!available()) {
			throw ComicApiException.unavailable();
		}

		this.store.running(userId).ifPresent(running -> {
			throw new ComicApiException(HttpStatus.CONFLICT, "comic_in_progress", "만들고 있는 만화가 있어요",
					Map.of("comicId", running.toString()));
		});

		Instant now = Instant.now();
		Instant utcDay = now.atOffset(ZoneOffset.UTC).toLocalDate().atStartOfDay(ZoneOffset.UTC).toInstant();
		if (this.store.budgetExhaustedSince(utcDay) || this.store.countSince(utcDay) >= this.properties.serviceDailyLimit()) {
			throw ComicApiException.budgetExhausted();
		}

		LocalDate kstToday = now.atZone(KST).toLocalDate();
		Instant kstStart = kstToday.atStartOfDay(KST).toInstant();
		// 거절 · 실패는 몫에서 빠지지만 시도는 무료 한도를 쓴다. 거절을 되풀이해 서비스 몫을 혼자 쓰지 못하게 시도 수도 막는다
		if (this.store.countForUserSince(userId, kstStart) >= this.properties.userDailyLimit()
				|| this.store.attemptsForUserSince(userId, kstStart) >= this.properties.userDailyAttempts()) {
			throw new ComicApiException(HttpStatus.TOO_MANY_REQUESTS, "comic_daily_limit",
					"오늘 만들 수 있는 만화를 다 만들었어요. 내일 다시 만들어 주세요",
					Map.of("resetAt", kstToday.plusDays(1).atStartOfDay(KST).toInstant().toString()));
		}

		UUID id = UUID.randomUUID();
		this.store.insert(id, userId, dreamId, input.style(), title, text, now);
		return view(this.store.findOwned(id, userId).orElseThrow());
	}

	@Transactional(readOnly = true)
	public ComicView get(UUID userId, String comicId) {
		return view(this.store.findOwned(parse(comicId), userId).orElseThrow(ComicApiException::notFound));
	}

	/** 이 꿈으로 만든 내 만화, 최신순. 지운 것은 빼고 */
	@Transactional(readOnly = true)
	public List<ComicView> forDream(UUID userId, String dreamId) {
		if (dreamId == null || dreamId.isBlank()) {
			throw ComicApiException.invalidInput();
		}
		return this.store.forDream(userId, dreamId.strip()).stream().map(this::view).toList();
	}

	/**
	 * 지운다. 두 번 지워도 204 다. 만드는 중이면 일꾼이 다음 단계에서 버린다.
	 *
	 * <p>그림은 DB 를 지운 뒤에 지운다. 여기서 실패해도 행은 이미 그림을 가리키지 않으니 앱에는 보이지 않는다 — 경고만 남긴다.
	 */
	@Transactional
	public void delete(UUID userId, String comicId) {
		this.accounts.lockActive(userId);
		UUID id = parse(comicId);
		ComicStore.Deleted deleted = this.store.softDelete(id, userId, Instant.now()).orElse(null);
		if (deleted == null) {
			// 이미 지운 내 것이면 204, 없거나 남의 것이면 404
			Integer mine = this.jdbc.queryForObject("select count(*) from comics where id = ? and user_id = ?",
					Integer.class, id, userId);
			if (mine == null || mine == 0) {
				throw ComicApiException.notFound();
			}
			return;
		}
		try {
			this.storage.deleteAll(ComicStorage.comicPrefix(userId, id));
		}
		catch (RuntimeException ex) {
			log.warn("만화 그림 삭제 실패 comic={} — 행은 지웠음", id, ex);
		}
	}

	boolean available() {
		return this.ai.enabled() && this.properties.storageEnabled();
	}

	ComicView view(ComicRow row) {
		boolean done = "done".equals(row.status());
		List<String> urls = done && row.imageKey() != null ? List.of(this.storage.presignGet(row.imageKey())) : List.of();
		return new ComicView(row.id().toString(), row.dreamId(), row.style(), row.status(), done ? row.layout() : null,
				urls, panels(row.panels()), failMessage(row), row.createdAt(), row.finishedAt());
	}

	List<Panel> panels(String stored) {
		return stored == null ? List.of() : this.json.readValue(stored, PANELS);
	}

	private static String failMessage(ComicRow row) {
		return switch (row.status()) {
			case "refused" -> REFUSED_MESSAGE;
			case "failed" -> "budget".equals(row.failCode()) ? BUDGET_MESSAGE : FAILED_MESSAGE;
			default -> null;
		};
	}

	private static UUID parse(String id) {
		try {
			return UUID.fromString(id);
		}
		catch (IllegalArgumentException | NullPointerException ex) {
			throw ComicApiException.notFound();
		}
	}
}
