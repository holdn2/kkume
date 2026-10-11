package com.kkume.server.comic;

import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.stream.Collectors;

/** 메모리에 두는 가짜 그림 저장소. presigned 주소는 키를 담은 가짜 URL 이다 */
public class FakeComicStorage implements ComicStorage {

	private final Map<String, byte[]> objects = new ConcurrentHashMap<>();

	@Override
	public void put(String key, byte[] bytes, String contentType) {
		this.objects.put(key, bytes);
	}

	@Override
	public String presignGet(String key) {
		return "https://fake-s3.test/" + key + "?X-Amz-Expires=1800";
	}

	@Override
	public void copy(String fromKey, String toKey) {
		byte[] bytes = this.objects.get(fromKey);
		if (bytes == null) {
			throw new IllegalStateException("없는 그림: " + fromKey);
		}
		this.objects.put(toKey, bytes);
	}

	@Override
	public void deleteAll(String prefix) {
		this.objects.keySet().removeIf(k -> k.startsWith(prefix));
	}

	public boolean has(String key) {
		return this.objects.containsKey(key);
	}

	public Set<String> keysUnder(String prefix) {
		return this.objects.keySet().stream().filter(k -> k.startsWith(prefix)).collect(Collectors.toSet());
	}
}
