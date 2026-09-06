package com.kkume.server.dream;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;

import com.kkume.server.TestcontainersConfiguration;
import com.kkume.server.user.Provider;
import com.kkume.server.user.User;
import com.kkume.server.user.UserRepository;

/**
 * Flyway 마이그레이션과 엔티티 매핑이 실제 PostgreSQL에서 맞는지 본다.
 *
 * <p>{@code ddl-auto=validate} 라서 컨텍스트가 뜬 것만으로도 이미
 * "마이그레이션이 만든 테이블과 엔티티가 어긋나지 않는다"가 증명된다.
 */
@Import(TestcontainersConfiguration.class)
@SpringBootTest
class DreamPersistenceTest {

	@Autowired
	private DreamRepository dreams;

	@Autowired
	private UserRepository users;

	private User newUser() {
		Instant now = Instant.now();
		return users.save(new User(UUID.randomUUID(), Provider.KAKAO,
				"kakao-" + UUID.randomUUID(), "잠꾸러기 3847", now));
	}

	@Test
	void 기기가_만든_id를_그대로_저장한다() {
		User user = newUser();
		Instant now = Instant.now();
		// 모바일 newId() 형식: 36진수 시각 - 난수6. UUID 가 아니다
		String mobileId = Long.toString(System.currentTimeMillis(), 36) + "-a1b2c3";

		dreams.save(new Dream(mobileId, user.getId(), now, now));

		Dream saved = dreams.findById(mobileId).orElseThrow();
		assertThat(saved.getId()).isEqualTo(mobileId);
		assertThat(saved.getUserId()).isEqualTo(user.getId());
		assertThat(saved.getSttStatus()).isEqualTo(SttStatus.PENDING);
		assertThat(saved.getAudioUrl()).isNull();
		assertThat(saved.isDeleted()).isFalse();
	}

	@Test
	void 삭제는_행을_지우지_않고_deleted_at을_채운다() {
		User user = newUser();
		Instant now = Instant.now();
		Dream dream = dreams.save(new Dream("soft-" + UUID.randomUUID(), user.getId(), now, now));

		dream.softDelete(now);
		dreams.save(dream);

		Dream found = dreams.findById(dream.getId()).orElseThrow();
		assertThat(found.isDeleted()).isTrue();
		assertThat(found.getDeletedAt()).isNotNull();
	}

	@Test
	void 증분_동기화는_지워진_것도_함께_준다() {
		User user = newUser();
		Instant since = Instant.now().truncatedTo(ChronoUnit.MILLIS);
		Instant after = since.plusSeconds(1);

		Dream kept = dreams.save(new Dream("keep-" + UUID.randomUUID(), user.getId(), after, after));
		Dream removed = dreams.save(new Dream("gone-" + UUID.randomUUID(), user.getId(), after, after));
		removed.softDelete(after);
		dreams.save(removed);

		List<Dream> changed =
				dreams.findByUserIdAndUpdatedAtGreaterThanOrderByUpdatedAtAsc(user.getId(), since);

		// 지워진 것을 빼면 기기가 삭제를 영영 모르고 지운 기록이 되살아난다
		assertThat(changed).extracting(Dream::getId)
			.contains(kept.getId(), removed.getId());
	}

	@Test
	void 원본_오디오는_기기가_null을_보내도_지워지지_않는다() {
		User user = newUser();
		Instant now = Instant.now();
		Dream dream = dreams.save(new Dream("audio-" + UUID.randomUUID(), user.getId(), now, now));
		dream.attachAudio("https://s3.example/a.m4a", now);
		dreams.save(dream);

		// 기기에서 올라온 내용으로 갱신한다 — audioUrl 은 apply() 의 인자가 아니다
		dream.apply("제목", "본문", 1234, now, null, null, now, now);
		dreams.save(dream);

		assertThat(dreams.findById(dream.getId()).orElseThrow().getAudioUrl())
			.isEqualTo("https://s3.example/a.m4a");
	}
}
