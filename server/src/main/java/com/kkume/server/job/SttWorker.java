package com.kkume.server.job;

import java.time.Instant;
import java.util.Optional;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionTemplate;

import com.kkume.server.dream.Dream;
import com.kkume.server.dream.DreamRepository;
import com.kkume.server.dream.SttStatus;

/**
 * 변환 작업을 하나씩 꺼내 돌린다.
 *
 * <p><b>기록의 {@code text}와 {@code client_updated_at}은 건드리지 않는다.</b> 결과는 작업 행에만 두고,
 * 기록에는 {@code stt_status}만 바꾼다. 앱이 그것을 보고 원문을 받아 {@code text}에 합친다(문서 039 C1).
 * 서버가 {@code text}에 쓰면 변환 도중 사용자가 고친 글과 부딪혀 둘 중 하나가 사라진다.
 *
 * <p>변환 서비스 호출은 <b>트랜잭션 밖에서</b> 한다. 수십 초 걸리는 외부 호출 동안 DB 커넥션을
 * 쥐고 있으면 t3.micro 의 작은 커넥션 풀이 금방 마른다.
 */
@Component
@EnableConfigurationProperties(SttProperties.class)
public class SttWorker {

	private static final Logger log = LoggerFactory.getLogger(SttWorker.class);

	private final JobRepository jobs;

	private final DreamRepository dreams;

	private final TransactionTemplate transactions;

	private final ObjectProvider<SttTranscriber> transcriber;

	private final SttProperties properties;

	public SttWorker(JobRepository jobs, DreamRepository dreams, TransactionTemplate transactions,
			ObjectProvider<SttTranscriber> transcriber, SttProperties properties) {
		this.jobs = jobs;
		this.dreams = dreams;
		this.transactions = transactions;
		this.transcriber = transcriber;
		this.properties = properties;
		if (transcriber.getIfAvailable() == null) {
			log.info("변환기(SttTranscriber)가 없어 변환 작업을 받아 두기만 합니다. stt_status 는 pending 으로 남습니다.");
		}
	}

	@Scheduled(fixedDelayString = "${kkume.stt.poll}", initialDelayString = "${kkume.stt.poll}")
	public void poll() {
		if (!this.properties.workerEnabled()) {
			return;
		}
		try {
			while (runOnce()) {
				// 쌓인 만큼 연달아 처리한다
			}
		}
		catch (RuntimeException ex) {
			// 일꾼이 죽으면 스케줄러가 다음 주기에 다시 부른다. 여기서 던지면 로그만 남고 끝난다
			log.error("변환 작업 처리 중 예외", ex);
		}
	}

	/**
	 * 작업 하나를 처리한다.
	 *
	 * @return 처리한 것이 있으면 {@code true}. 변환기가 없으면 아무것도 하지 않고 {@code false}
	 */
	public boolean runOnce() {
		SttTranscriber stt = this.transcriber.getIfAvailable();
		if (stt == null) {
			return false;
		}
		recoverStale();

		Optional<Claimed> claimed = this.transactions.execute(status -> claim());
		if (claimed == null || claimed.isEmpty()) {
			return false;
		}
		Claimed c = claimed.get();

		try {
			String text = stt.transcribe(c.audioLocation());
			this.transactions.executeWithoutResult(status -> finish(c, text, null));
		}
		catch (SttException ex) {
			this.transactions.executeWithoutResult(status -> finish(c, null, ex));
		}
		catch (RuntimeException ex) {
			// 서비스 쪽 예외는 모양을 알 수 없다. 다시 해 볼 만한 실패로 친다
			log.warn("변환 호출 실패 job={}", c.jobId(), ex);
			this.transactions.executeWithoutResult(
					status -> finish(c, null, new SttException("provider_error", true, ex.getMessage())));
		}
		return true;
	}

	private Optional<Claimed> claim() {
		Instant now = Instant.now();
		return this.jobs.lockNext(JobType.STT.code(), now).map(job -> {
			job.start(now);
			String location = this.dreams.findById(job.getDreamId()).map(Dream::getAudioUrl).orElse(null);
			return new Claimed(job.getId(), job.getDreamId(), location);
		});
	}

	private void finish(Claimed c, String text, SttException error) {
		Instant now = Instant.now();
		Job job = this.jobs.findById(c.jobId()).orElseThrow();
		Dream dream = this.dreams.findById(c.dreamId()).orElseThrow();

		if (error == null) {
			job.succeed(text, now);
			dream.changeSttStatus(SttStatus.DONE, now);
			return;
		}
		if (error.retryable() && job.getAttempts() < this.properties.maxAttempts()) {
			// 기록의 stt_status 는 pending 그대로다. updated_at 도 올리지 않는다 — 앱에 알릴 변화가 없다
			job.requeue(error.code(), now.plus(this.properties.backoff().multipliedBy(job.getAttempts())), now);
			return;
		}
		job.fail(error.code(), now);
		dream.changeSttStatus(SttStatus.FAILED, now);
	}

	/** running 에 오래 머문 작업은 잡은 서버가 죽은 것이다. 줄로 되돌리거나, 횟수를 다 썼으면 실패로 끝낸다 */
	private void recoverStale() {
		this.transactions.executeWithoutResult(status -> {
			Instant now = Instant.now();
			for (Job job : this.jobs.findRunning()) {
				if (!job.isStale(now, this.properties.lease())) {
					continue;
				}
				if (job.getAttempts() < this.properties.maxAttempts()) {
					job.requeue("interrupted", now, now);
				}
				else {
					job.fail("interrupted", now);
					this.dreams.findById(job.getDreamId()).ifPresent(d -> d.changeSttStatus(SttStatus.FAILED, now));
				}
			}
		});
	}

	private record Claimed(java.util.UUID jobId, String dreamId, String audioLocation) {
	}
}
