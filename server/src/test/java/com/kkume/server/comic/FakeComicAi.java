package com.kkume.server.comic;

import java.math.BigDecimal;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.Supplier;

/**
 * 가짜 모델. 기본은 계약에 맞는 대본과 3바이트 그림을 돌려준다. 테스트는 다음 호출의 답을 줄에 넣어 바꾼다.
 */
public class FakeComicAi implements ComicAi {

	static final String GOOD_SCRIPT = """
			{"character":"a young adult with short black hair wearing a grey hoodie",
			 "panels":[
			  {"scene":"A long school hallway stretches endlessly.","caption":"복도를 걸었는데 길이 끝없이 늘어났다","dialogue":null},
			  {"scene":"She opens a door to a bright blue sea.","caption":"첫 번째 문을 열자 바다가 나타났다","dialogue":"바다다!"},
			  {"scene":"Another door shows the same ocean.","caption":"두 번째 문에서도 같은 바다였다","dialogue":"null"},
			  {"scene":"A small puppy waits behind the last door.","caption":"마지막 문에 강아지가 기다렸다","dialogue":"늦었잖아"}
			 ]}""";

	static final byte[] IMAGE = { (byte) 0xFF, (byte) 0xD8, (byte) 0xFF };

	private final Deque<Supplier<String>> scripts = new ArrayDeque<>();

	private final Deque<Supplier<byte[]>> images = new ArrayDeque<>();

	final AtomicInteger scriptCalls = new AtomicInteger();

	final AtomicInteger drawCalls = new AtomicInteger();

	volatile String lastPrompt;

	volatile String lastUserMessage;

	void nextScript(Supplier<String> answer) {
		this.scripts.add(answer);
	}

	void nextImage(Supplier<byte[]> answer) {
		this.images.add(answer);
	}

	void reset() {
		this.scripts.clear();
		this.images.clear();
		this.scriptCalls.set(0);
		this.drawCalls.set(0);
	}

	@Override
	public Reply<String> script(String system, String user) {
		this.scriptCalls.incrementAndGet();
		this.lastUserMessage = user;
		Supplier<String> next = this.scripts.poll();
		String content = next == null ? GOOD_SCRIPT : next.get();
		return new Reply<>(content, new Usage("script", "@cf/openai/gpt-oss-120b", 600, 900, 0,
				ComicPricing.script(600, 900), 5));
	}

	@Override
	public Reply<byte[]> draw(String prompt) {
		this.drawCalls.incrementAndGet();
		this.lastPrompt = prompt;
		Supplier<byte[]> next = this.images.poll();
		byte[] bytes = next == null ? IMAGE : next.get();
		return new Reply<>(bytes, new Usage("image", "@cf/black-forest-labs/flux-2-klein-4b", null, null, 1,
				ComicPricing.image(1024, 1024), 7));
	}

	static ComicAiException failure(ComicAiException.Kind kind, String code) {
		return new ComicAiException(kind, code, "가짜 실패 " + code,
				new Usage("image", "@cf/black-forest-labs/flux-2-klein-4b", null, null, 0, BigDecimal.ZERO, 3), null);
	}
}
