package com.kkume.server.comic;

import java.time.Instant;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionTemplate;

import tools.jackson.databind.json.JsonMapper;

import com.kkume.server.comic.ComicStore.Claimed;

/**
 * 줄에 선 만화를 하나씩 그린다: scripting(대본) → drawing(그림) → done.
 *
 * <p><b>모델 호출은 트랜잭션 밖에서</b> 한다 — 그림 한 장에 20~36초 걸린다(문서 082). 그동안 DB 커넥션을 쥐고 있으면
 * t3.micro 의 작은 풀이 마른다. 단계를 옮길 때마다 짧은 트랜잭션으로 조건부 갱신을 하고, 그 사이 앱이나 계정 삭제가
 * 만화를 지웠으면(갱신 0행) 거기서 그만둔다.
 *
 * <p>호출마다 원가를 한 줄 남긴다(081 04장). 실패한 호출도 남긴다.
 */
@Component
public class ComicWorker {

	private static final Logger log = LoggerFactory.getLogger(ComicWorker.class);

	static final int SCRIPT_ATTEMPTS = 2;

	private final ComicStore store;

	private final ComicStorage storage;

	private final ComicAi ai;

	private final ComicProperties properties;

	private final TransactionTemplate transactions;

	private final JsonMapper json;

	public ComicWorker(ComicStore store, ComicStorage storage, ComicAi ai, ComicProperties properties,
			TransactionTemplate transactions, JsonMapper json) {
		this.store = store;
		this.storage = storage;
		this.ai = ai;
		this.properties = properties;
		this.transactions = transactions;
		this.json = json;
	}

	@Scheduled(fixedDelayString = "${kkume.comic.poll}", initialDelayString = "${kkume.comic.poll}")
	public void poll() {
		if (!this.properties.workerEnabled() || !this.ai.enabled() || !this.properties.storageEnabled()) {
			return;
		}
		try {
			while (runOnce()) {
				// 쌓인 만큼 연달아 그린다
			}
		}
		catch (RuntimeException ex) {
			// 스케줄러가 다음 주기에 다시 부른다. 멈춘 만화는 lease 가 지나면 실패로 끝난다
			log.error("만화 처리 중 예외", ex);
		}
	}

	/**
	 * 만화 하나를 끝까지 처리한다.
	 *
	 * @return 처리한 것이 있으면 {@code true}
	 */
	public boolean runOnce() {
		Instant now = Instant.now();
		this.transactions.executeWithoutResult(s -> {
			int stale = this.store.failStale(now.minus(this.properties.lease()), now);
			if (stale > 0) {
				log.warn("멈춘 만화 {}개를 실패로 끝냄(interrupted)", stale);
			}
		});

		Optional<Claimed> claimed = this.transactions.execute(s -> this.store.claimNext(Instant.now()));
		if (claimed == null || claimed.isEmpty()) {
			return false;
		}
		Claimed c = claimed.get();
		try {
			process(c);
		}
		catch (ComicAiException ex) {
			fail(c, ex);
		}
		catch (RuntimeException ex) {
			// 모양을 알 수 없는 실패(S3 · JSON 등). 만화는 실패로 끝내고 다음 것으로 넘어간다
			log.warn("만화 처리 실패 comic={}", c.id(), ex);
			finish(c.id(), "failed", "internal");
		}
		return true;
	}

	private void process(Claimed c) {
		ComicScript script = script(c);
		if (script == null) {
			finish(c.id(), "failed", "invalid_script");
			return;
		}
		String panels = this.json.writeValueAsString(script.panels());
		String scenes = this.json.writeValueAsString(Map.of("character", script.character(), "scenes", script.scenes()));
		Integer saved = this.transactions.execute(s -> this.store.saveScript(c.id(), panels, scenes, Instant.now()));
		if (saved == null || saved == 0) {
			log.info("대본을 쓰는 사이 지운 만화 comic={} — 그리지 않음", c.id());
			return;
		}

		ComicAi.Reply<byte[]> image = draw(c, script.gridPrompt(c.style()));
		cost(c.id(), image.usage(), true, null);

		String key = ComicStorage.comicPrefix(c.userId(), c.id()) + "grid.jpg";
		this.storage.put(key, image.value(), "image/jpeg");
		Integer done = this.transactions.execute(s -> this.store.finishDone(c.id(), "grid2x2", key, Instant.now()));
		if (done == null || done == 0) {
			// 그리는 사이 지웠다(앱 · 계정 삭제). 방금 올린 그림을 치운다 — 계정 삭제의 쓸어 내기도 한 번 더 본다
			log.info("그리는 사이 지운 만화 comic={} — 그림을 치움", c.id());
			this.storage.deleteAll(ComicStorage.comicPrefix(c.userId(), c.id()));
		}
	}

	/**
	 * 그림. 결과 검열(3030)에 걸리면 한 번 다시 그린다(081 06장) — 무해한 꿈에서도 그림마다 다르게 걸린다.
	 * 두 번째도 걸리면 그 예외가 그대로 나가 failed 로 끝난다.
	 */
	private ComicAi.Reply<byte[]> draw(Claimed c, String prompt) {
		try {
			return this.ai.draw(prompt);
		}
		catch (ComicAiException ex) {
			if (!CloudflareComicAi.OUTPUT_FLAGGED.equals(ex.code())) {
				throw ex;
			}
			if (ex.usage() != null) {
				cost(c.id(), ex.usage(), false, ex.code());
			}
			log.info("그림 결과가 검열에 걸림 comic={} — 한 번 다시 그림", c.id());
			return this.ai.draw(prompt);
		}
	}

	/**
	 * 대본. 계약에 맞지 않으면 한 번 다시 부른다(081 06장). 두 번 다 어기면 {@code null}.
	 *
	 * <p>해설 말투만 어긋난 것도 다시 부르지만, 마지막 차례면 그대로 쓴다 — 말투로 만화를 실패시키지 않는다.
	 */
	private ComicScript script(Claimed c) {
		String user = ComicScript.userMessage(c.title(), c.dreamText());
		ComicScript spoken = null;
		for (int attempt = 1; attempt <= SCRIPT_ATTEMPTS; attempt++) {
			ComicAi.Reply<String> reply = this.ai.script(ComicScript.system(c.gender()), user);
			Optional<ComicScript> parsed = ComicScript.parse(this.json, reply.value());
			if (parsed.isEmpty()) {
				cost(c.id(), reply.usage(), false, "invalid_script");
				log.info("대본이 계약에 맞지 않음 comic={} attempt={}", c.id(), attempt);
				continue;
			}
			if (parsed.get().spokenCaption() && attempt < SCRIPT_ATTEMPTS) {
				cost(c.id(), reply.usage(), false, "spoken_caption");
				log.info("해설이 말하는 말투 comic={} attempt={} — 다시 부름", c.id(), attempt);
				spoken = parsed.get();
				continue;
			}
			cost(c.id(), reply.usage(), true, null);
			return parsed.get();
		}
		// 두 번째가 계약을 어겼으면 첫 번째의 말투만 어긋난 대본이라도 쓴다
		return spoken;
	}

	private void fail(Claimed c, ComicAiException ex) {
		if (ex.usage() != null) {
			cost(c.id(), ex.usage(), false, ex.code());
		}
		switch (ex.kind()) {
			case REFUSED -> {
				log.info("모델이 만화를 거절 comic={} code={}", c.id(), ex.code());
				finish(c.id(), "refused", ex.code());
			}
			case BUDGET -> {
				// 한동안(kkume.comic.budget-block) 새 요청은 만들기 단계에서 503 comic_budget_exhausted 로 막힌다
				log.warn("Workers AI 무료 한도 초과 — 잠시 새 만화 요청을 막음 comic={}", c.id());
				finish(c.id(), "failed", "budget");
			}
			case FAILED -> {
				log.warn("만화 모델 호출 실패 comic={} code={} {}", c.id(), ex.code(), ex.getMessage());
				finish(c.id(), "failed", ex.code());
			}
		}
	}

	private void finish(UUID id, String status, String code) {
		this.transactions.executeWithoutResult(s -> this.store.finishFailure(id, status, code, Instant.now()));
	}

	private void cost(UUID id, ComicAi.Usage usage, boolean ok, String error) {
		try {
			this.transactions.executeWithoutResult(s -> this.store.recordCost(id, usage, ok, error, Instant.now()));
		}
		catch (RuntimeException ex) {
			// 원가 기록이 실패해도 만화는 끝까지 만든다
			log.warn("만화 원가 기록 실패 comic={}", id, ex);
		}
	}
}
