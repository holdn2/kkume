package com.kkume.server.job;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface JobRepository extends JpaRepository<Job, UUID> {

	Optional<Job> findByDreamIdAndType(String dreamId, JobType type);

	/**
	 * 지금 할 수 있는 작업 하나를 <b>잠그면서</b> 고른다.
	 *
	 * <p>{@code SKIP LOCKED} 라서 다른 트랜잭션이 잡고 있는 행은 건너뛴다. 지금은 서버가 한 대라
	 * 겹칠 일이 없지만, 배포 중 두 컨테이너가 잠깐 겹쳐도 같은 작업을 두 번 돌리지 않는다.
	 */
	@Query(value = """
			select * from jobs
			where status = 'queued' and type = :type and run_after <= :now
			order by run_after
			limit 1
			for update skip locked
			""", nativeQuery = true)
	Optional<Job> lockNext(@Param("type") String type, @Param("now") Instant now);

	@Query("select j from Job j where j.status = com.kkume.server.job.JobStatus.RUNNING")
	List<Job> findRunning();
}
