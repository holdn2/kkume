package com.kkume.server.audio;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Map;
import java.util.OptionalLong;
import java.util.UUID;
import java.util.regex.Pattern;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

import com.kkume.server.dream.Dream;
import com.kkume.server.dream.DreamRepository;
import com.kkume.server.dream.SttStatus;
import com.kkume.server.job.Job;
import com.kkume.server.job.JobRepository;
import com.kkume.server.job.JobType;

/**
 * 오디오 업로드와 변환 상태. 계약은 문서 039(모바일 040에서 수용).
 *
 * <p><b>서버가 기록에 쓰는 것은 {@code audio_url} · {@code stt_status} · {@code updated_at}뿐이다.</b>
 * {@code text}와 {@code client_updated_at}은 어디서도 바꾸지 않는다 — 합치기는 앱의 몫이고,
 * 동기화의 "늦은 쪽이 이긴다"가 기기 시계만 보게 하기 위해서다.
 */
@Service
public class AudioService {

	/** 키의 마지막 조각. {@link #prepareUpload}가 만드는 모양이다 */
	private static final Pattern RANDOM_PART = Pattern.compile("[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\\.m4a");

	private final DreamRepository dreams;

	private final JobRepository jobs;

	private final AudioStorage storage;

	private final AudioProperties properties;

	private final TransactionTemplate transactions;

	public AudioService(DreamRepository dreams, JobRepository jobs, AudioStorage storage, AudioProperties properties,
			TransactionTemplate transactions) {
		this.dreams = dreams;
		this.jobs = jobs;
		this.storage = storage;
		this.properties = properties;
		this.transactions = transactions;
	}

	/** ② 업로드 자리를 준다 */
	public UploadTicket prepareUpload(UUID userId, String dreamId) {
		Dream dream = this.transactions.execute(status -> owned(userId, this.dreams.findById(dreamId).orElse(null)));
		if (dream.isDeleted()) {
			throw new AudioApiException(HttpStatus.CONFLICT, "dream_deleted", "지운 기록입니다");
		}
		if (dream.getDurationMs() == null) {
			// audio_path 는 있는데 duration_ms 가 없으면 stop() 전에 죽은 녹음이다. 변환도 실패한다
			throw new AudioApiException(HttpStatus.CONFLICT, "recording_unfinished", "끝나지 않은 녹음입니다");
		}
		if (dream.getAudioUrl() != null) {
			throw new AudioApiException(HttpStatus.CONFLICT, "audio_exists", "이미 올라간 오디오가 있습니다");
		}
		// 요청마다 새 키를 만든다. 오래된 URL 이 늦게 도착해도 나중 업로드를 덮지 못한다
		String key = prefix(userId, dreamId) + UUID.randomUUID() + ".m4a";
		AudioStorage.Ticket ticket = this.storage.presignUpload(key);
		return new UploadTicket(ticket.url(), "PUT", ticket.headers(), key, ticket.expiresAt());
	}

	/** ④ 다 올렸다. 파일이 실제로 있는지 본 뒤에만 audio_url 을 채운다. 같은 요청을 두 번 보내도 된다 */
	public String complete(UUID userId, String dreamId, String key) {
		// 기록이 내 것인지부터 본다. 남의 기록이면 키가 맞든 틀리든 "없음"이다
		Dream before = this.transactions.execute(status -> owned(userId, this.dreams.findById(dreamId).orElse(null)));

		String prefix = prefix(userId, dreamId);
		if (key == null || !key.startsWith(prefix) || !RANDOM_PART.matcher(key.substring(prefix.length())).matches()) {
			// S3 확인보다 먼저 한다. 남의 경로를 넣어 그 파일이 있는지 떠보는 데 쓰이지 않게 한다
			throw new AudioApiException(HttpStatus.BAD_REQUEST, "key_mismatch", "이 기록의 업로드 경로가 아닙니다");
		}

		// 이미 끝난 요청이면 S3 를 다시 두드리지 않는다(응답 유실 뒤 재전송)
		String location = this.storage.location(key);
		if (location.equals(before.getAudioUrl())) {
			return before.getSttStatus().code();
		}

		// S3 확인은 트랜잭션 밖에서 한다. 외부 호출 동안 행 잠금을 쥐고 있지 않는다
		OptionalLong size = this.storage.sizeOf(key);
		if (size.isEmpty()) {
			throw new AudioApiException(HttpStatus.UNPROCESSABLE_CONTENT, "upload_missing", "올라간 파일이 없습니다");
		}
		if (size.getAsLong() > this.properties.maxBytes()) {
			this.storage.delete(key);
			throw new AudioApiException(HttpStatus.CONTENT_TOO_LARGE, "audio_too_large", "파일이 너무 큽니다");
		}

		return this.transactions.execute(status -> {
			Dream dream = owned(userId, this.dreams.findForUpdate(dreamId).orElse(null));
			if (location.equals(dream.getAudioUrl())) {
				return dream.getSttStatus().code();
			}
			if (dream.isDeleted()) {
				throw new AudioApiException(HttpStatus.CONFLICT, "dream_deleted", "지운 기록입니다");
			}
			if (dream.getAudioUrl() != null) {
				throw new AudioApiException(HttpStatus.CONFLICT, "audio_exists", "이미 올라간 오디오가 있습니다");
			}
			Instant now = Instant.now();
			// 둘 다 updated_at 을 올린다 — 받기에 다시 내려가 앱이 audioUrl 이 채워진 것을 안다
			dream.attachAudio(location, now);
			dream.changeSttStatus(SttStatus.PENDING, now);
			this.jobs.save(new Job(JobType.STT, dreamId, userId, now));
			return SttStatus.PENDING.code();
		});
	}

	/** ⑦ 변환 상태와 원문 */
	public SttView stt(UUID userId, String dreamId) {
		return this.transactions.execute(status -> {
			Dream dream = withAudio(owned(userId, this.dreams.findById(dreamId).orElse(null)));
			Job job = this.jobs.findByDreamIdAndType(dreamId, JobType.STT).orElse(null);
			SttStatus stt = dream.getSttStatus();
			return new SttView(stt.code(),
					stt == SttStatus.DONE && job != null ? job.getResult() : null,
					// 자동 재시도 중에 남은 오류는 보여 주지 않는다. 앱에는 아직 pending 이다
					stt == SttStatus.FAILED && job != null ? job.getError() : null,
					job == null ? 0 : job.getAttempts(),
					job == null ? dream.getUpdatedAt() : job.getUpdatedAt());
		});
	}

	/** 실패한 변환을 다시 줄 세운다 */
	public String retry(UUID userId, String dreamId) {
		return this.transactions.execute(status -> {
			Dream dream = withAudio(owned(userId, this.dreams.findForUpdate(dreamId).orElse(null)));
			SttStatus stt = dream.getSttStatus();
			if (stt == SttStatus.DONE) {
				throw new AudioApiException(HttpStatus.CONFLICT, "already_done", "이미 변환이 끝났습니다");
			}
			if (stt == SttStatus.PENDING) {
				return stt.code();
			}
			Instant now = Instant.now();
			Job job = this.jobs.findByDreamIdAndType(dreamId, JobType.STT)
				.orElseGet(() -> this.jobs.save(new Job(JobType.STT, dreamId, userId, now)));
			job.retry(now);
			dream.changeSttStatus(SttStatus.PENDING, now);
			return SttStatus.PENDING.code();
		});
	}

	/**
	 * 남의 기록도 "없음"으로 답한다. 동기화의 {@code not_owned}와 일부러 다르다 —
	 * 여기는 기록 하나를 경로로 가리키는 자리라, 구분해 주면 그 id 가 있는지 떠볼 수 있다.
	 */
	private static Dream owned(UUID userId, Dream dream) {
		if (dream == null || !dream.getUserId().equals(userId)) {
			throw new AudioApiException(HttpStatus.NOT_FOUND, "dream_not_found", "기록을 찾지 못했습니다");
		}
		return dream;
	}

	private static Dream withAudio(Dream dream) {
		if (dream.getAudioUrl() == null) {
			throw new AudioApiException(HttpStatus.NOT_FOUND, "no_audio", "올라간 오디오가 없습니다");
		}
		return dream;
	}

	/**
	 * 기록 id 는 기기가 만든 문자열이라 {@code /}가 들어오면 다른 기록의 경로와 겹칠 수 있다. 인코딩해서 막는다.
	 * 앱은 이 키를 해석하지 않고 {@code complete}에 그대로 돌려주기만 한다.
	 */
	static String prefix(UUID userId, String dreamId) {
		return "audio/" + userId + "/" + URLEncoder.encode(dreamId, StandardCharsets.UTF_8) + "/";
	}

	public record UploadTicket(String uploadUrl, String method, Map<String, String> headers, String key,
			Instant expiresAt) {
	}

	public record SttView(String status, String text, String error, int attempts, Instant updatedAt) {
	}
}
