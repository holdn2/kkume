package com.kkume.server.comic;

import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.math.BigDecimal;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;

import javax.imageio.ImageIO;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.Supplier;

/**
 * 가짜 모델. 기본은 계약에 맞는 대본과 작은 JPEG 를 돌려준다. 테스트는 다음 호출의 답을 줄에 넣어 바꾼다.
 */
public class FakeComicAi implements ComicAi {

	static final String GOOD_SCRIPT = """
			{"cast":[{"name":"ME","look":"a young adult with short black hair wearing a grey hoodie"},
			         {"name":"PUPPY","look":"a small white puppy with a red collar"}],
			 "panels":[
			  {"scene":"In a long school hallway, ME walks as the hallway stretches endlessly.","who":["ME"],"caption":"복도를 걸었는데 길이 끝없이 늘어났다","dialogue":null},
			  {"scene":"At a door in the hallway, ME opens the door to a bright blue sea.","who":["ME"],"caption":"첫 번째 문을 열자 바다가 나타났다","dialogue":"바다다!"},
			  {"scene":"Another door shows the same ocean.","who":[],"caption":"두 번째 문에서도 같은 바다였다","dialogue":"null"},
			  {"scene":"Behind the last door, PUPPY waits for ME.","who":["PUPPY"],"caption":"마지막 문에 강아지가 기다렸다","dialogue":"늦었잖아"}
			 ]}""";

	/** 진짜 JPEG(8×8). 서버가 기준 그림을 자르고 컷을 붙이므로 읽을 수 있는 그림이어야 한다 */
	static final byte[] IMAGE = jpeg();

	/** 이번 만화에서 부른 그림 프롬프트 · 참조 그림 수 · 크기(차례대로) */
	final List<String> prompts = new CopyOnWriteArrayList<>();

	final List<Integer> referenceCounts = new CopyOnWriteArrayList<>();

	final List<String> sizes = new CopyOnWriteArrayList<>();

	private final Deque<Supplier<String>> scripts = new ArrayDeque<>();

	private final Deque<Supplier<byte[]>> images = new ArrayDeque<>();

	final AtomicInteger scriptCalls = new AtomicInteger();

	final AtomicInteger drawCalls = new AtomicInteger();

	volatile String lastPrompt;

	volatile String lastUserMessage;

	volatile String lastSystem;

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
		this.prompts.clear();
		this.referenceCounts.clear();
		this.sizes.clear();
	}

	@Override
	public Reply<String> script(String system, String user) {
		this.scriptCalls.incrementAndGet();
		this.lastUserMessage = user;
		this.lastSystem = system;
		Supplier<String> next = this.scripts.poll();
		String content = next == null ? GOOD_SCRIPT : next.get();
		return new Reply<>(content, new Usage("script", "@cf/openai/gpt-oss-120b", 600, 900, 0,
				ComicPricing.script(600, 900), 5));
	}

	@Override
	public Reply<byte[]> draw(String prompt, int width, int height, List<byte[]> references) {
		this.drawCalls.incrementAndGet();
		this.lastPrompt = prompt;
		this.prompts.add(prompt);
		this.referenceCounts.add(references.size());
		this.sizes.add(width + "x" + height);
		Supplier<byte[]> next = this.images.poll();
		byte[] bytes = next == null ? IMAGE : next.get();
		return new Reply<>(bytes, new Usage("image", "@cf/black-forest-labs/flux-2-klein-4b", null, null, 1,
				ComicPricing.image(references.size()), 7));
	}

	private static byte[] jpeg() {
		try {
			BufferedImage image = new BufferedImage(8, 8, BufferedImage.TYPE_INT_RGB);
			ByteArrayOutputStream out = new ByteArrayOutputStream();
			ImageIO.write(image, "jpeg", out);
			return out.toByteArray();
		}
		catch (IOException ex) {
			throw new UncheckedIOException(ex);
		}
	}

	static ComicAiException failure(ComicAiException.Kind kind, String code) {
		return new ComicAiException(kind, code, "가짜 실패 " + code,
				new Usage("image", "@cf/black-forest-labs/flux-2-klein-4b", null, null, 0, BigDecimal.ZERO, 3), null);
	}
}
