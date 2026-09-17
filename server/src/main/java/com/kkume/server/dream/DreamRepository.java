package com.kkume.server.dream;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import jakarta.persistence.LockModeType;

import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface DreamRepository extends JpaRepository<Dream, String> {

	/**
	 * 마지막으로 받아간 뒤 바뀐 것만 준다. 증분 동기화의 뼈대다(5주차).
	 *
	 * <p><b>지워진 것도 함께 준다.</b> deleted_at 이 채워진 행을 빼면 기기가
	 * 삭제를 영영 모르고, 지운 기록이 다음 동기화에서 되살아난다.
	 */
	List<Dream> findByUserIdAndUpdatedAtGreaterThanOrderByUpdatedAtAsc(UUID userId, Instant since);

	/**
	 * 위와 같은 일을 하되 <b>페이지로 끊어서</b> 준다. 기기를 바꾸거나 앱을 다시 깔면
	 * 서버에 있는 전부를 받아야 하는데, 그것을 한 응답에 담으면 t3.micro 가 버티지 못한다.
	 *
	 * <p>정렬 기준이 {@code (updated_at, id)} 인 이유는 <b>같은 시각의 기록이 여럿일 때
	 * 페이지 경계에서 한 건이 사라지는 것</b>을 막기 위해서다. 시각만으로 끊으면
	 * 다음 페이지를 {@code updated_at > since} 로 이어받게 되고, 경계에 걸친
	 * 같은 시각의 나머지 기록은 아무도 받아 가지 않는다. id 까지 넣어 순서를 완전하게 만든다.
	 *
	 * <p>{@code cursor} 가 {@code null} 이면 그 조건은 거짓이 되어 {@code since} 와
	 * 같은 시각의 기록은 빠진다. 이미 받아 간 것들이므로 그것이 맞다.
	 */
	@Query("""
			select d from Dream d
			where d.userId = :userId
			  and (d.updatedAt > :since or (d.updatedAt = :since and d.id > :cursor))
			order by d.updatedAt asc, d.id asc
			""")
	List<Dream> findChangedSince(@Param("userId") UUID userId, @Param("since") Instant since,
			@Param("cursor") String cursor, Pageable pageable);

	/**
	 * 행을 잠그고 읽는다. 오디오 {@code complete}와 변환 재시도가 쓴다.
	 *
	 * <p>응답이 유실돼 앱이 같은 {@code complete}를 거의 동시에 두 번 보내면, 잠그지 않을 때 둘 다
	 * "아직 오디오 없음"을 보고 작업을 두 번 만들려다 한쪽이 유일 제약에 걸려 500 이 된다.
	 */
	@Lock(LockModeType.PESSIMISTIC_WRITE)
	@Query("select d from Dream d where d.id = :id")
	Optional<Dream> findForUpdate(@Param("id") String id);
}
