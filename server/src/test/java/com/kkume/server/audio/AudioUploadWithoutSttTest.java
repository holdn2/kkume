package com.kkume.server.audio;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.BDDMockito.given;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import com.kkume.server.TestcontainersConfiguration;
import com.kkume.server.auth.GoogleTokenVerifier;
import com.kkume.server.auth.SocialIdentity;
import com.kkume.server.dream.DreamRepository;
import com.kkume.server.job.JobRepository;
import com.kkume.server.job.JobType;
import com.kkume.server.user.Provider;

/**
 * 운영 설정 그대로({@code kkume.stt.enqueue=false}) — 받아쓰기는 기기가 녹음하면서 한다(문서 048).
 *
 * <p>업로드가 끝나도 변환 작업을 만들지 않는다. 녹음은 사용자가 받아쓴 글과 대조해 보는 사본일 뿐이다.
 * {@link AudioApiTest}는 서버 변환 경로를 지키려고 작업 생성을 켜고 돈다.
 */
@Import({ TestcontainersConfiguration.class, AudioUploadWithoutSttTest.Fakes.class })
@SpringBootTest(properties = "kkume.stt.worker-enabled=false")
@AutoConfigureMockMvc
class AudioUploadWithoutSttTest {

	@TestConfiguration(proxyBeanMethods = false)
	static class Fakes {

		@Bean
		@Primary
		FakeAudioStorage fakeAudioStorage() {
			return new FakeAudioStorage();
		}
	}

	@Autowired
	private MockMvc mockMvc;

	@Autowired
	private DreamRepository dreams;

	@Autowired
	private JobRepository jobs;

	@Autowired
	private FakeAudioStorage storage;

	@MockitoBean
	private GoogleTokenVerifier googleVerifier;

	@Test
	void 받아쓰기_녹음을_올려도_변환_작업은_만들지_않는다() throws Exception {
		given(this.googleVerifier.verify(anyString()))
			.willReturn(new SocialIdentity(Provider.GOOGLE, "google-sub-" + UUID.randomUUID()));
		String token = JsonPath.read(this.mockMvc
			.perform(post("/api/auth/google").contentType(MediaType.APPLICATION_JSON).content("{\"idToken\":\"x\"}"))
			.andExpect(status().isOk())
			.andReturn().getResponse().getContentAsString(), "$.accessToken");
		String auth = "Bearer " + token;

		String id = "wav-" + UUID.randomUUID().toString().substring(0, 8);
		this.mockMvc.perform(post("/api/sync/dreams").header("Authorization", auth)
			.contentType(MediaType.APPLICATION_JSON)
			.content("""
					{"dreams":[{"id":"%s","recordedAt":"2026-09-26T21:00:00.000Z","title":null,"text":"받아쓴 꿈",
					"durationMs":60000,"deletedAt":null,"updatedAt":"2026-09-26T21:01:00.000Z"}]}""".formatted(id)))
			.andExpect(status().isOk());

		String key = JsonPath.read(this.mockMvc.perform(post("/api/dreams/" + id + "/audio/upload").header("Authorization", auth)
			.contentType(MediaType.APPLICATION_JSON).content("{\"format\":\"wav\"}"))
			.andExpect(status().isOk())
			.andReturn().getResponse().getContentAsString(), "$.key");
		this.storage.put(key, 1_920_000);

		String r = this.mockMvc.perform(post("/api/dreams/" + id + "/audio/complete").header("Authorization", auth)
			.contentType(MediaType.APPLICATION_JSON).content("{\"key\":\"" + key + "\"}"))
			.andExpect(status().isOk())
			.andReturn().getResponse().getContentAsString();

		assertThat(this.dreams.findById(id).orElseThrow().getAudioUrl()).endsWith(".wav");
		assertThat(this.jobs.findByDreamIdAndType(id, JobType.STT)).isEmpty();
		// 응답 모양은 그대로다. 기록의 stt_status 는 건드리지 않아 기본값(pending)이 온다
		assertThat(JsonPath.<String>read(r, "$.sttStatus")).isEqualTo("pending");
		// 서버는 받아쓴 글을 바꾸지 않는다
		assertThat(this.dreams.findById(id).orElseThrow().getText()).isEqualTo("받아쓴 꿈");
	}
}
