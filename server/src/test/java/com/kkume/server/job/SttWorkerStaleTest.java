package com.kkume.server.job;

import java.time.Duration;
import java.time.Instant;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.support.DefaultListableBeanFactory;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.transaction.support.TransactionTemplate;

import com.kkume.server.TestcontainersConfiguration;
import com.kkume.server.dream.Dream;
import com.kkume.server.dream.DreamRepository;
import com.kkume.server.dream.SttStatus;
import com.kkume.server.user.Provider;
import com.kkume.server.user.User;
import com.kkume.server.user.UserRepository;

/**
 * 작업을 잡은 채 서버가 죽은 경우. 배포로 컨테이너가 교체되면 실제로 일어난다.
 *
 * <p>되돌리지 않으면 그 작업은 영영 {@code running}으로 남고, 앱은 {@code pending}을 끝없이 본다.
 */
@Import(TestcontainersConfiguration.class)
@SpringBootTest(properties = "kkume.stt.worker-enabled=false")
class SttWorkerStaleTest {

	private static final Duration LEASE = Duration.ofMinutes(10);

	@Autowired
	private JobRepository jobs;

	@Autowired
	private DreamRepository dreams;

	@Autowired
	private UserRepository users;

	@Autowired
	private TransactionTemplate transactions;

	@BeforeEach
	void emptyQueue() {
		this.transactions.executeWithoutResult(s -> this.jobs.deleteAll());
	}

	private SttWorker workerReturning(String text) {
		DefaultListableBeanFactory factory = new DefaultListableBeanFactory();
		factory.registerSingleton("transcriber", (SttTranscriber) location -> text);
		ObjectProvider<SttTranscriber> provider = factory.getBeanProvider(SttTranscriber.class);
		return new SttWorker(this.jobs, this.dreams, this.transactions, provider,
				new SttProperties(false, Duration.ofSeconds(5), 3, Duration.ZERO, LEASE));
	}

	/** 기록 하나와, 그 기록의 작업을 {@code attempts}번째로 잡은 채 {@code lockedAgo} 전에 멈춘 상태를 만든다 */
	private String stuckJob(int attempts, Duration lockedAgo) {
		return this.transactions.execute(s -> {
			Instant now = Instant.now();
			User user = this.users.save(new User(UUID.randomUUID(), Provider.GOOGLE, "g-" + UUID.randomUUID(), "잠꾸러기 0001", now));
			String id = "stuck-" + UUID.randomUUID();
			Dream dream = new Dream(id, user.getId(), now, now);
			dream.attachAudio("s3://test/audio/" + id + ".m4a", now);
			this.dreams.save(dream);

			Job job = new Job(JobType.STT, id, user.getId(), now);
			for (int i = 0; i < attempts; i++) {
				job.start(now.minus(lockedAgo));
			}
			this.jobs.save(job);
			return id;
		});
	}

	@Test
	void 오래_running인_작업은_줄로_되돌려_다시_잡는다() {
		String id = stuckJob(1, LEASE.plusMinutes(1));

		assertThat(workerReturning("되살린 뒤 변환").runOnce()).isTrue();

		Job job = this.jobs.findByDreamIdAndType(id, JobType.STT).orElseThrow();
		assertThat(job.getStatus()).isEqualTo(JobStatus.DONE);
		// 죽은 시도도 한 번으로 친다. 무한히 되살리지 않게 하려는 것이다
		assertThat(job.getAttempts()).isEqualTo(2);
		assertThat(job.getResult()).isEqualTo("되살린 뒤 변환");
		assertThat(this.dreams.findById(id).orElseThrow().getSttStatus()).isEqualTo(SttStatus.DONE);
	}

	@Test
	void 횟수를_다_쓴_채_멈춘_작업은_failed로_끝낸다() {
		String id = stuckJob(3, LEASE.plusMinutes(1));

		assertThat(workerReturning("불리면 안 됨").runOnce()).isFalse();

		Job job = this.jobs.findByDreamIdAndType(id, JobType.STT).orElseThrow();
		assertThat(job.getStatus()).isEqualTo(JobStatus.FAILED);
		assertThat(job.getError()).isEqualTo("interrupted");
		assertThat(this.dreams.findById(id).orElseThrow().getSttStatus()).isEqualTo(SttStatus.FAILED);
	}

	@Test
	void 아직_일하는_중인_작업은_건드리지_않는다() {
		String id = stuckJob(1, Duration.ofMinutes(1));

		assertThat(workerReturning("불리면 안 됨").runOnce()).isFalse();

		assertThat(this.jobs.findByDreamIdAndType(id, JobType.STT).orElseThrow().getStatus()).isEqualTo(JobStatus.RUNNING);
	}
}
