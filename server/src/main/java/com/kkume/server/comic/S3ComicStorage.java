package com.kkume.server.comic;

import java.util.List;

import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.CopyObjectRequest;
import software.amazon.awssdk.services.s3.model.Delete;
import software.amazon.awssdk.services.s3.model.DeleteObjectsRequest;
import software.amazon.awssdk.services.s3.model.DeleteObjectsResponse;
import software.amazon.awssdk.services.s3.model.GetObjectRequest;
import software.amazon.awssdk.services.s3.model.ListObjectsV2Request;
import software.amazon.awssdk.services.s3.model.ListObjectsV2Response;
import software.amazon.awssdk.services.s3.model.ObjectIdentifier;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;
import software.amazon.awssdk.services.s3.presigner.S3Presigner;
import software.amazon.awssdk.services.s3.presigner.model.GetObjectPresignRequest;

/** S3 에 둔다. 자격증명은 EC2 인스턴스 프로파일에서 온다 — 역할에 {@code comics/*} · {@code posts/*} 권한이 있어야 한다 */
class S3ComicStorage implements ComicStorage {

	private final S3Client s3;

	private final S3Presigner presigner;

	private final ComicProperties properties;

	S3ComicStorage(S3Client s3, S3Presigner presigner, ComicProperties properties) {
		this.s3 = s3;
		this.presigner = presigner;
		this.properties = properties;
	}

	@Override
	public void put(String key, byte[] bytes, String contentType) {
		this.s3.putObject(PutObjectRequest.builder().bucket(this.properties.bucket()).key(key).contentType(contentType)
			.build(), RequestBody.fromBytes(bytes));
	}

	@Override
	public String presignGet(String key) {
		return this.presigner.presignGetObject(GetObjectPresignRequest.builder()
			.signatureDuration(this.properties.imageTtl())
			.getObjectRequest(GetObjectRequest.builder().bucket(this.properties.bucket()).key(key).build())
			.build()).url().toString();
	}

	@Override
	public void copy(String fromKey, String toKey) {
		this.s3.copyObject(CopyObjectRequest.builder()
			.sourceBucket(this.properties.bucket()).sourceKey(fromKey)
			.destinationBucket(this.properties.bucket()).destinationKey(toKey)
			.build());
	}

	@Override
	public void deleteAll(String prefix) {
		String token = null;
		do {
			ListObjectsV2Response page = this.s3.listObjectsV2(ListObjectsV2Request.builder()
				.bucket(this.properties.bucket()).prefix(prefix).continuationToken(token).build());
			List<ObjectIdentifier> keys = page.contents().stream()
				.map(o -> ObjectIdentifier.builder().key(o.key()).build())
				.toList();
			if (!keys.isEmpty()) {
				DeleteObjectsResponse result = this.s3.deleteObjects(DeleteObjectsRequest.builder()
					.bucket(this.properties.bucket()).delete(Delete.builder().objects(keys).quiet(true).build()).build());
				if (!result.errors().isEmpty()) {
					throw new IllegalStateException("만화 그림을 지우지 못했습니다: " + result.errors().get(0).code());
				}
			}
			token = Boolean.TRUE.equals(page.isTruncated()) ? page.nextContinuationToken() : null;
		}
		while (token != null);
	}
}
