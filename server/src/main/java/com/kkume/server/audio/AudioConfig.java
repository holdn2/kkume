package com.kkume.server.audio;

import java.util.OptionalLong;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import software.amazon.awssdk.auth.credentials.DefaultCredentialsProvider;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.presigner.S3Presigner;

@Configuration
@EnableConfigurationProperties(AudioProperties.class)
class AudioConfig {

	private static final Logger log = LoggerFactory.getLogger(AudioConfig.class);

	/**
	 * 버킷이 없으면 S3 클라이언트를 만들지 않는다. 로컬 개발에서 AWS 자격증명 없이도 서버가 뜨게 하기 위해서다.
	 * 그때 오디오 엔드포인트는 {@code 503 audio_unavailable}을 준다.
	 */
	@Bean
	AudioStorage audioStorage(AudioProperties properties) {
		if (!properties.enabled()) {
			log.info("kkume.audio.bucket 이 비어 있어 오디오 업로드를 받지 않습니다(503 audio_unavailable).");
			return new Unavailable();
		}
		Region region = Region.of(properties.region());
		DefaultCredentialsProvider credentials = DefaultCredentialsProvider.builder().build();
		S3Client s3 = S3Client.builder().region(region).credentialsProvider(credentials).build();
		S3Presigner presigner = S3Presigner.builder().region(region).credentialsProvider(credentials).build();
		return new S3AudioStorage(s3, presigner, properties);
	}

	/** 버킷이 설정되지 않은 서버 */
	static class Unavailable implements AudioStorage {

		@Override
		public Ticket presignUpload(String key) {
			throw unavailable();
		}

		@Override
		public OptionalLong sizeOf(String key) {
			throw unavailable();
		}

		@Override
		public void delete(String key) {
			throw unavailable();
		}

		@Override
		public String location(String key) {
			throw unavailable();
		}

		private static AudioApiException unavailable() {
			return new AudioApiException(org.springframework.http.HttpStatus.SERVICE_UNAVAILABLE, "audio_unavailable",
					"이 서버는 오디오를 받지 않습니다");
		}
	}
}
