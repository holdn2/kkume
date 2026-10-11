package com.kkume.server.comic;

import java.math.BigDecimal;
import java.math.MathContext;
import java.math.RoundingMode;

/**
 * Workers AI 가격표(2026-10, 문서 082의 스모크 테스트와 같은 값). 무료 플랜은 청구하지 않지만 하루 10,000뉴런에서 빠지는 양을
 * 이것으로 환산해 남긴다 — 12주차 수익모델 문서의 "1편 실측 원가"가 이 기록이다(계획서 001).
 *
 * <p>가격이 바뀌면 여기만 고친다. 지난 기록은 그때 값으로 남는다.
 */
final class ComicPricing {

	/** 1,000 뉴런 = $0.011 */
	static final BigDecimal USD_PER_NEURON = new BigDecimal("0.000011");

	/** gpt-oss-120b — 입력 $0.35 · 출력 $0.75 / 백만 토큰 */
	private static final BigDecimal SCRIPT_IN = new BigDecimal("0.00000035");

	private static final BigDecimal SCRIPT_OUT = new BigDecimal("0.00000075");

	/** flux-2-klein-4b — 512×512 칸 하나에 $0.000287. 1024×1024 는 네 칸 */
	private static final BigDecimal IMAGE_TILE = new BigDecimal("0.000287");

	private ComicPricing() {
	}

	static BigDecimal script(Integer inputTokens, Integer outputTokens) {
		return SCRIPT_IN.multiply(BigDecimal.valueOf(inputTokens == null ? 0 : inputTokens))
			.add(SCRIPT_OUT.multiply(BigDecimal.valueOf(outputTokens == null ? 0 : outputTokens)));
	}

	static BigDecimal image(int width, int height) {
		long tiles = (long) Math.ceil(width / 512.0) * (long) Math.ceil(height / 512.0);
		return IMAGE_TILE.multiply(BigDecimal.valueOf(tiles));
	}

	static BigDecimal neurons(BigDecimal usd) {
		return usd.divide(USD_PER_NEURON, new MathContext(12)).setScale(3, RoundingMode.HALF_UP);
	}
}
