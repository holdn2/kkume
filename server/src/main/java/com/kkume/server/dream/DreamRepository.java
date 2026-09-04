package com.kkume.server.dream;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

public interface DreamRepository extends JpaRepository<Dream, String> {

	/**
	 * 마지막으로 받아간 뒤 바뀐 것만 준다. 증분 동기화의 뼈대다(5주차).
	 *
	 * <p><b>지워진 것도 함께 준다.</b> deleted_at 이 채워진 행을 빼면 기기가
	 * 삭제를 영영 모르고, 지운 기록이 다음 동기화에서 되살아난다.
	 */
	List<Dream> findByUserIdAndUpdatedAtGreaterThanOrderByUpdatedAtAsc(UUID userId, Instant since);
}
