package com.kkume.server.audio;

import java.time.Instant;
import java.util.Map;
import java.util.OptionalLong;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 메모리에 두는 가짜 저장소. 앱이 presigned URL 로 PUT 하는 것은 {@link #put}으로 흉내 낸다.
 *
 * <p>진짜 S3 의 서명 · 권한 동작은 여기서 보지 않는다. 그것은 {@link S3AudioStorageTest}(서명)와
 * 실제 버킷에 대한 수동 확인으로 본다.
 */
public class FakeAudioStorage implements AudioStorage {

	private final Map<String, Long> objects = new ConcurrentHashMap<>();

	private final Set<String> deleted = ConcurrentHashMap.newKeySet();

	/** 앱이 URL 로 파일을 올린 것처럼 만든다 */
	public void put(String key, long size) {
		this.objects.put(key, size);
	}

	public boolean wasDeleted(String key) {
		return this.deleted.contains(key);
	}

	@Override
	public Ticket presignUpload(String key, String contentType) {
		return new Ticket("https://fake-bucket.example/" + key + "?X-Amz-Signature=fake",
				Map.of("Content-Type", contentType), Instant.now().plusSeconds(900));
	}

	@Override
	public OptionalLong sizeOf(String key) {
		Long size = this.objects.get(key);
		return size == null ? OptionalLong.empty() : OptionalLong.of(size);
	}

	@Override
	public void delete(String key) {
		this.objects.remove(key);
		this.deleted.add(key);
	}

	@Override
	public String location(String key) {
		return "s3://fake-bucket/" + key;
	}
}
