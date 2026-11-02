package com.kkume.server.user;

import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.doAnswer;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;

import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

import com.kkume.server.TestcontainersConfiguration;
import com.kkume.server.auth.GoogleTokenVerifier;
import com.kkume.server.auth.SocialIdentity;

/**
 * 로그인 중 동의 갱신과 계정 삭제가 겹칠 때(문서 105 R6). 로그인이 사용자 행을 읽은 바로 뒤에 다른 요청의 계정 삭제가
 * 끝나게 만든다 — 저장소를 감싸 찾기가 돌아온 순간 삭제를 끝까지 돌린다.
 */
@Import(TestcontainersConfiguration.class)
@SpringBootTest(properties = { "kkume.stt.worker-enabled=false", "kkume.comic.worker-enabled=false" })
@AutoConfigureMockMvc
class LoginDeletionRaceTest {

	@Autowired
	private MockMvc mockMvc;

	@Autowired
	private JdbcTemplate jdbc;

	@Autowired
	private AccountDeletionService deletion;

	@MockitoSpyBean
	private UserRepository users;

	@PersistenceContext
	private EntityManager entities;

	@MockitoBean
	private GoogleTokenVerifier googleVerifier;

	private ResultActions login(String sub, String consentVersion) throws Exception {
		given(this.googleVerifier.verify(anyString())).willReturn(new SocialIdentity(Provider.GOOGLE, sub));
		return this.mockMvc.perform(post("/api/auth/google").contentType(MediaType.APPLICATION_JSON)
			.content("{\"idToken\":\"x\",\"consentVersion\":\"" + consentVersion + "\"}"));
	}

	@Test
	void 로그인이_읽은_뒤_탈퇴가_끝나도_지운_계정이_되살아나지_않는다() throws Exception {
		String sub = "google-sub-" + UUID.randomUUID();
		String r = login(sub, "2026-10-07").andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
		UUID id = UUID.fromString(JsonPath.read(r, "$.user.id"));

		AtomicReference<Throwable> failed = new AtomicReference<>();
		doAnswer(invocation -> {
			// 저장소가 프록시라 진짜 메서드를 부를 수 없다. 같은 트랜잭션의 EntityManager 로 똑같이 읽는다
			Optional<User> found = this.entities
				.createQuery("select u from User u where u.provider = :p and u.providerId = :id", User.class)
				.setParameter("p", Provider.GOOGLE).setParameter("id", sub).getResultStream().findFirst();
			// 로그인 트랜잭션은 행을 읽기만 했다. 이 사이에 다른 기기에서 탈퇴가 끝난다
			Thread other = new Thread(() -> {
				try {
					this.deletion.delete(id);
				}
				catch (Throwable t) {
					failed.set(t);
				}
			});
			other.start();
			other.join(10_000);
			return found;
		}).when(this.users).findByProviderAndProviderId(Provider.GOOGLE, sub);

		// 새 동의 버전이라 로그인이 사용자 행을 고친다
		int status = login(sub, "2026-10-20").andReturn().getResponse().getStatus();

		assertThat(failed.get()).isNull();
		Map<String, Object> row = this.jdbc.queryForMap("select provider_id, nickname, deleted_at from users where id = ?", id);
		assertThat(row.get("deleted_at")).as("지운 계정이 되살아났다").isNotNull();
		assertThat((String) row.get("provider_id")).startsWith("deleted:");
		// 지운 계정에 토큰을 주지 않는다
		assertThat(status).isEqualTo(401);
	}
}
