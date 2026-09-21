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
	 *
	 * <p><b>지운 기록의 작업은 건너뛴다.</b> 올린 뒤 앱에서 지운 기록에 변환 비용을 쓰지 않으려는 것이다.
	 * 작업 자체는 {@code queued} 그대로 두어, 앱이 되살리면(deleted_at 이 null 로 돌아오면)
	 * 아무 조작 없이 다음에 잡힌다. 잠그는 것은 jobs 행뿐이다 — dreams 행까지 잠그면 그 사이 동기화가 막힌다.
	 */
	@Query(value = """
			select j.* from jobs j
			join dreams d on d.id = j.dream_id
			where j.status = 'queued' and j.type = :type and j.run_after <= :now
			  and d.deleted_at is null
			order by j.run_after
			limit 1
			for update of j skip locked
			""", nativeQuery = true)
	Optional<Job> lockNext(@Param("type") String type, @Param("now") Instant now);

	@Query("select j from Job j where j.status = com.kkume.server.job.JobStatus.RUNNING")
	List<Job> findRunning();
}
