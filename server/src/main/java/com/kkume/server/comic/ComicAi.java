package com.kkume.server.comic;

import java.math.BigDecimal;

/**
 * 대본 · 그림을 만드는 모델. 운영은 Cloudflare Workers AI({@link CloudflareComicAi}), 테스트는 가짜다.
 *
 * <p>호출 한 번마다 {@link Usage}를 돌려준다 — 실패해도 예외에 실어 준다. 원가 기록(081 04장)이 그것을 쓴다.
 */
public interface ComicAi {

	/** Cloudflare 계정 · 토큰이 없는 서버(로컬)는 {@code false}다. 그때 만들기는 503 {@code comic_unavailable} */
	default boolean enabled() {
		return true;
	}

	/**
	 * 대본 모델을 한 번 부른다. 돌려준 글이 JSON 인지 · 계약에 맞는지는 부른 쪽이 본다({@link ComicScript#parse}).
	 *
	 * @throws ComicAiException 모델이 답하지 않았다
	 */
	Reply<String> script(String system, String user);

	/**
	 * 그림 한 장(1024×1024 JPEG).
	 *
	 * @throws ComicAiException 거절({@link ComicAiException.Kind#REFUSED}) · 무료 한도 초과 · 그 밖의 실패
	 */
	Reply<byte[]> draw(String prompt);

	/**
	 * @param usd 가격표로 환산한 금액. 무료 한도 안이면 실제 청구는 0이다
	 */
	record Usage(String step, String model, Integer inputTokens, Integer outputTokens, int images, BigDecimal usd,
			long durationMs) {
	}

	record Reply<T>(T value, Usage usage) {
	}
}
