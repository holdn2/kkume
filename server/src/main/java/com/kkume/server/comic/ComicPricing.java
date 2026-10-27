package com.kkume.server.comic;

import java.math.BigDecimal;
import java.math.MathContext;
import java.math.RoundingMode;

/**
 * Workers AI 가격. 무료 플랜은 청구하지 않지만 하루 10,000뉴런에서 빠지는 양을 금액으로 환산해 남긴다 — 12주차 수익모델 문서의
 * "1편 실측 원가"가 이 기록이다(계획서 001).
 *
 * <p>응답 머리글 {@code cf-ai-neurons}(대본은 {@code usage.neurons})에 호출마다 실제로 빠진 뉴런이 온다. 있으면 그 값을 쓰고
 * ({@link #fromNeurons}), 없을 때만 아래 표로 어림한다.
 *
 * <p>그림은 가격표("출력 512² 칸마다 26.05뉴런")와 달리 <b>크기와 상관없이 한 번에 104.20뉴런</b>이다 — 2026-10-27 실측
 * 1024² · 768² · 512² · 256² 모두 104.20. 참조 그림은 가격표대로 한 장에 5.37뉴런이 붙었다(512² 이하 한 칸).
 *
 * <p>가격이 바뀌면 여기만 고친다. 지난 기록은 그때 값으로 남는다.
 */
final class ComicPricing {

	/** 1,000 뉴런 = $0.011 */
	static final BigDecimal USD_PER_NEURON = new BigDecimal("0.000011");

	/** gpt-oss-120b — 입력 $0.35 · 출력 $0.75 / 백만 토큰 */
	private static final BigDecimal SCRIPT_IN = new BigDecimal("0.00000035");

	private static final BigDecimal SCRIPT_OUT = new BigDecimal("0.00000075");

	/** flux-2-klein-4b — 그림 한 번(크기 무관, 10-27 실측) */
	static final BigDecimal IMAGE_CALL_NEURONS = new BigDecimal("104.20");

	/** flux-2-klein-4b — 참조 그림 한 장(512² 이하 한 칸) */
	static final BigDecimal REFERENCE_NEURONS = new BigDecimal("5.37");

	private ComicPricing() {
	}

	static BigDecimal script(Integer inputTokens, Integer outputTokens) {
		return SCRIPT_IN.multiply(BigDecimal.valueOf(inputTokens == null ? 0 : inputTokens))
			.add(SCRIPT_OUT.multiply(BigDecimal.valueOf(outputTokens == null ? 0 : outputTokens)));
	}

	/** 그림 한 번의 어림값. 참조 그림 수만 본다 */
	static BigDecimal image(int references) {
		return fromNeurons(IMAGE_CALL_NEURONS.add(REFERENCE_NEURONS.multiply(BigDecimal.valueOf(references))));
	}

	static BigDecimal fromNeurons(BigDecimal neurons) {
		return neurons.multiply(USD_PER_NEURON);
	}

	static BigDecimal neurons(BigDecimal usd) {
		return usd.divide(USD_PER_NEURON, new MathContext(12)).setScale(3, RoundingMode.HALF_UP);
	}
}
