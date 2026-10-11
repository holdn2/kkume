package com.kkume.server.comic;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpStatus;
import org.springframework.web.client.RestClient;

import software.amazon.awssdk.auth.credentials.DefaultCredentialsProvider;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.presigner.S3Presigner;
import tools.jackson.databind.json.JsonMapper;

@Configuration
@EnableConfigurationProperties(ComicProperties.class)
class ComicConfig {

	private static final Logger log = LoggerFactory.getLogger(ComicConfig.class);

	/** 버킷이 없으면 S3 클라이언트를 만들지 않는다 — 로컬에서 AWS 자격증명 없이 서버를 띄우는 경우다 */
	@Bean
	ComicStorage comicStorage(ComicProperties properties) {
		if (!properties.storageEnabled()) {
			log.info("kkume.comic.bucket 이 비어 있어 만화를 만들지 않습니다(503 comic_unavailable).");
			return new UnavailableStorage();
		}
		Region region = Region.of(properties.region());
		DefaultCredentialsProvider credentials = DefaultCredentialsProvider.builder().build();
		return new S3ComicStorage(S3Client.builder().region(region).credentialsProvider(credentials).build(),
				S3Presigner.builder().region(region).credentialsProvider(credentials).build(), properties);
	}

	@Bean
	ComicAi comicAi(ComicProperties properties, JsonMapper json) {
		ComicProperties.Cloudflare cf = properties.cloudflare();
		if (cf == null || !cf.configured()) {
			log.info("Cloudflare 계정 · 토큰(KKUME_CLOUDFLARE_ACCOUNT_ID · KKUME_CLOUDFLARE_API_TOKEN)이 없어 만화를 만들지 않습니다.");
			return new DisabledAi();
		}
		return CloudflareComicAi.create(RestClient.builder(), json, cf);
	}

	static class DisabledAi implements ComicAi {

		@Override
		public boolean enabled() {
			return false;
		}

		@Override
		public Reply<String> script(String system, String user) {
			throw new IllegalStateException("만화 모델이 설정되지 않았습니다");
		}

		@Override
		public Reply<byte[]> draw(String prompt) {
			throw new IllegalStateException("만화 모델이 설정되지 않았습니다");
		}
	}

	/** 버킷이 설정되지 않은 서버. 만든 그림도 없으니 지우기는 막지 않는다 — 계정 삭제가 여기서 멈추면 안 된다 */
	static class UnavailableStorage implements ComicStorage {

		@Override
		public void put(String key, byte[] bytes, String contentType) {
			throw unavailable();
		}

		@Override
		public String presignGet(String key) {
			throw unavailable();
		}

		@Override
		public void copy(String fromKey, String toKey) {
			throw unavailable();
		}

		@Override
		public void deleteAll(String prefix) {
		}

		private static ComicApiException unavailable() {
			return new ComicApiException(HttpStatus.SERVICE_UNAVAILABLE, "comic_unavailable", "지금은 만화를 만들 수 없어요");
		}
	}
}
