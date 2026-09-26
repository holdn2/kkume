package com.kkume.server.audio;

import java.net.URI;
import java.time.Duration;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

import software.amazon.awssdk.auth.credentials.AwsBasicCredentials;
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.presigner.S3Presigner;

/**
 * presigned URL 의 모양을 본다. 서명은 네트워크 없이 만들어지므로 가짜 자격증명으로 충분하다.
 *
 * <p>여기서 확인하는 것은 <b>앱이 지켜야 하는 조건이 URL 에 실제로 박혔는가</b>다 —
 * Content-Type 이 서명에 들어가야 앱이 다른 형식을 올리지 못하고, 유효시간이 15분이어야 한다.
 */
class S3AudioStorageTest {

	private final AudioProperties properties = new AudioProperties("kkume-audio-test", "ap-southeast-2",
			26_214_400L, Duration.ofMinutes(15));

	private S3AudioStorage storage() {
		StaticCredentialsProvider creds = StaticCredentialsProvider.create(AwsBasicCredentials.create("AKIAFAKE", "fake"));
		Region region = Region.of(this.properties.region());
		return new S3AudioStorage(S3Client.builder().region(region).credentialsProvider(creds).build(),
				S3Presigner.builder().region(region).credentialsProvider(creds).build(), this.properties);
	}

	@Test
	void 업로드_URL에_Content_Type과_15분이_박힌다() {
		AudioStorage.Ticket ticket = storage().presignUpload("audio/u1/d1/abc.m4a", "audio/mp4");
		URI url = URI.create(ticket.url());

		assertThat(url.getHost()).isEqualTo("kkume-audio-test.s3.ap-southeast-2.amazonaws.com");
		assertThat(url.getPath()).isEqualTo("/audio/u1/d1/abc.m4a");
		assertThat(url.getQuery()).contains("X-Amz-Expires=900");
		// 서명에 content-type 이 들어가야 앱이 헤더를 바꿔 보내면 S3 가 거절한다
		assertThat(url.getQuery()).contains("X-Amz-SignedHeaders=content-type;host");
		assertThat(ticket.headers()).containsEntry("Content-Type", "audio/mp4");
	}

	@Test
	void 저장_위치는_URL이_아니라_식별자다() {
		assertThat(storage().location("audio/u1/d1/abc.m4a")).isEqualTo("s3://kkume-audio-test/audio/u1/d1/abc.m4a");
	}
}
