package com.kkume.server.audio;

import java.util.Map;
import java.util.OptionalLong;

import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.DeleteObjectRequest;
import software.amazon.awssdk.services.s3.model.HeadObjectRequest;
import software.amazon.awssdk.services.s3.model.NoSuchKeyException;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;
import software.amazon.awssdk.services.s3.model.S3Exception;
import software.amazon.awssdk.services.s3.presigner.S3Presigner;
import software.amazon.awssdk.services.s3.presigner.model.PresignedPutObjectRequest;
import software.amazon.awssdk.services.s3.presigner.model.PutObjectPresignRequest;

/**
 * S3 에 둔다. 자격증명은 EC2 인스턴스 프로파일에서 온다.
 *
 * <p><b>없는 파일을 403 이 아니라 404 로 받으려면 {@code s3:ListBucket} 권한이 필요하다.</b>
 * 그 권한이 없으면 S3 는 "없음"과 "권한 없음"을 구분해 주지 않는다. 여기서는 404 만 "없음"으로 보고,
 * 403 은 설정 오류라 그대로 던진다 — 권한 문제를 "앱이 안 올렸다"로 조용히 바꾸지 않기 위해서다.
 */
class S3AudioStorage implements AudioStorage {

	private final S3Client s3;

	private final S3Presigner presigner;

	private final AudioProperties properties;

	S3AudioStorage(S3Client s3, S3Presigner presigner, AudioProperties properties) {
		this.s3 = s3;
		this.presigner = presigner;
		this.properties = properties;
	}

	@Override
	public Ticket presignUpload(String key, String contentType) {
		PutObjectRequest put = PutObjectRequest.builder()
			.bucket(this.properties.bucket())
			.key(key)
			.contentType(contentType)
			.build();
		PresignedPutObjectRequest signed = this.presigner.presignPutObject(PutObjectPresignRequest.builder()
			.signatureDuration(this.properties.uploadTtl())
			.putObjectRequest(put)
			.build());
		// host 는 URL 에 들어 있어 앱이 따로 붙일 필요가 없다. 앱에 넘길 것은 Content-Type 하나다
		return new Ticket(signed.url().toString(), Map.of("Content-Type", contentType),
				signed.expiration());
	}

	@Override
	public OptionalLong sizeOf(String key) {
		try {
			Long length = this.s3.headObject(HeadObjectRequest.builder().bucket(this.properties.bucket()).key(key).build())
				.contentLength();
			return length == null ? OptionalLong.empty() : OptionalLong.of(length);
		}
		catch (NoSuchKeyException ex) {
			return OptionalLong.empty();
		}
		catch (S3Exception ex) {
			if (ex.statusCode() == 404) {
				return OptionalLong.empty();
			}
			throw ex;
		}
	}

	@Override
	public void delete(String key) {
		this.s3.deleteObject(DeleteObjectRequest.builder().bucket(this.properties.bucket()).key(key).build());
	}

	@Override
	public String location(String key) {
		return "s3://" + this.properties.bucket() + "/" + key;
	}
}
