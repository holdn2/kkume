package com.kkume.server.audio;

import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.Optional;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionTemplate;

import com.kkume.server.dream.DreamRepository;

/**
 * 올리기만 하고 {@code complete}가 안 된 녹음을 지운다(문서 105 R3). 업로드 자리는 요청마다 새 키라, 이것이 없으면
 * 어느 기록에도 붙지 않은 파일이 버킷에 영영 남는다.
 *
 * <p>하루를 기다린다. 앱은 올린 뒤 연결이 끊기면 {@code complete}를 나중에 다시 보낸다 — 그 사이 지우면
 * {@code upload_missing}으로 한 번 더 올리게 된다(앱이 원본을 갖고 있어 잃지는 않는다).
 *
 * <p>지울지 볼 때는 그 기록 행을 잡는다 — {@code complete}가 연결할 때 잡는 것과 같은 잠금이다. 안 잡으면 "아무 기록에도
 * 안 붙음"을 본 직후 {@code complete}가 연결을 커밋하고, 그다음 지워서 {@code audio_url}이 없는 파일을 가리키게 된다(PR #178 리뷰).
 */
@Component
class AudioSweeper {

	static final Duration ORPHAN_AGE = Duration.ofDays(1);

	private static final Logger log = LoggerFactory.getLogger(AudioSweeper.class);

	private final AudioStorage storage;

	private final DreamRepository dreams;

	private final TransactionTemplate transactions;

	AudioSweeper(AudioStorage storage, DreamRepository dreams, TransactionTemplate transactions) {
		this.storage = storage;
		this.dreams = dreams;
		this.transactions = transactions;
	}

	@Scheduled(fixedDelayString = "${kkume.audio.sweep:1h}", initialDelayString = "${kkume.audio.sweep:1h}")
	void scheduled() {
		try {
			sweep(Instant.now());
		}
		catch (RuntimeException ex) {
			log.warn("올리다 만 녹음을 정리하지 못했습니다", ex);
		}
	}

	/** @return 지운 수 */
	int sweep(Instant now) {
		int removed = 0;
		for (AudioStorage.Stored stored : this.storage.list("audio/")) {
			if (stored.lastModified().isAfter(now.minus(ORPHAN_AGE))) {
				continue;
			}
			Boolean deleted = this.transactions.execute(s -> {
				dreamId(stored.key()).ifPresent(this.dreams::findForUpdate);
				if (this.dreams.existsByAudioUrl(this.storage.location(stored.key()))) {
					return false;
				}
				this.storage.delete(stored.key());
				return true;
			});
			if (Boolean.TRUE.equals(deleted)) {
				removed++;
			}
		}
		if (removed > 0) {
			log.info("올리다 만 녹음 {}개를 지웠습니다", removed);
		}
		return removed;
	}

	/** {@code audio/<사용자>/<기록 id(URL 인코딩)>/<난수>.<확장자>}의 기록 id */
	static Optional<String> dreamId(String key) {
		String[] parts = key.split("/");
		return parts.length == 4 ? Optional.of(URLDecoder.decode(parts[2], StandardCharsets.UTF_8))
				: Optional.empty();
	}
}
