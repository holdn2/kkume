package com.kkume.server.comic;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * 대본 — 프롬프트와 결과 검사. 프롬프트는 문서 081 06장(스모크 테스트 082에서 쓴 것) 그대로다.
 *
 * <p>검사(082에서 실제로 본 실패): 컷이 정확히 4개인지, {@code character} · {@code scene}이 영어인지 — 그림 모델은
 * 한국어를 읽지 못한다. 해설 30자 · 대사 20자를 넘으면 자른다. 어기면 한 번 다시 부르고, 두 번째도 어기면 실패다.
 */
public record ComicScript(String character, List<Scene> scenes) {

	public static final int PANELS = 4;

	static final int MAX_CAPTION = 30;

	static final int MAX_DIALOGUE = 20;

	public record Scene(String scene, String caption, String dialogue) {
	}

	/** 앱에 보내는 컷. 그림 위에 얹는다 */
	public record Panel(String caption, String dialogue) {
	}

	static final String SYSTEM = """
			You turn a Korean dream journal entry into a 4-panel comic script.
			Return ONLY a JSON object, no markdown, with this shape:
			{"character": "<English, one sentence: the dreamer's fixed look — age, hair, clothes — reuse in every panel>",
			 "panels": [{"scene": "<English, concrete visual description of this panel, 1-2 sentences, no text or letters in the image>",
			             "caption": "<Korean narration, max 30 characters>",
			             "dialogue": "<Korean line a character says, max 20 characters, or null>"}]}
			Keep the dream's own events; do not add new plot. Captions are written in the dreamer's past tense (~했다).
			"character" and every "scene" MUST be written in English (the image model does not read Korean); only "caption" and "dialogue" are Korean.
			Exactly 4 panels in story order.""";

	private static final Pattern HANGUL = Pattern.compile("[\\u1100-\\u11FF\\u3130-\\u318F\\uAC00-\\uD7A3]");

	private static final Pattern OBJECT = Pattern.compile("\\{[\\s\\S]*\\}");

	/** 꿈 제목 · 본문만 보낸다(081 05장 — 처리방침에 적는 범위) */
	static String userMessage(String title, String dreamText) {
		return title == null || title.isBlank() ? dreamText : title.strip() + "\n\n" + dreamText;
	}

	/** 그림 프롬프트(081 06장). 그림에는 글자를 넣지 않는다 — 앱이 해설 · 대사를 얹는다 */
	String gridPrompt(String style) {
		return String.join(" ",
				"A single comic page divided into a 2x2 grid of four equal square panels separated by thin white gutters.",
				"Absolutely no text, no letters, no speech bubbles anywhere.",
				"The same main character appears in every panel: " + this.character + ".",
				"Art style: " + styleText(style) + ".",
				"Top-left panel: " + this.scenes.get(0).scene(),
				"Top-right panel: " + this.scenes.get(1).scene(),
				"Bottom-left panel: " + this.scenes.get(2).scene(),
				"Bottom-right panel: " + this.scenes.get(3).scene());
	}

	static String styleText(String style) {
		return switch (style) {
			case "ink" -> "black and white ink manga style, clean line art, screentone shading, high contrast";
			default -> "soft pastel watercolor illustration, gentle rounded shapes, warm dreamy lighting, children's picture book style";
		};
	}

	List<Panel> panels() {
		return this.scenes.stream().map(s -> new Panel(s.caption(), s.dialogue())).toList();
	}

	/**
	 * 모델이 돌려준 글에서 대본을 꺼낸다. 앞뒤에 다른 말이 붙어 있어도 가장 바깥 {@code { … }}를 읽는다.
	 *
	 * @return 계약에 맞지 않으면 비어 있다 — 부른 쪽이 한 번 다시 부른다
	 */
	static Optional<ComicScript> parse(JsonMapper json, String content) {
		if (content == null) {
			return Optional.empty();
		}
		Matcher m = OBJECT.matcher(content);
		if (!m.find()) {
			return Optional.empty();
		}
		JsonNode root;
		try {
			root = json.readTree(m.group());
		}
		catch (RuntimeException ex) {
			return Optional.empty();
		}
		String character = text(root.path("character"));
		JsonNode panels = root.path("panels");
		if (character == null || !english(character) || !panels.isArray() || panels.size() != PANELS) {
			return Optional.empty();
		}
		List<Scene> scenes = new ArrayList<>();
		for (JsonNode p : panels) {
			String scene = text(p.path("scene"));
			String caption = text(p.path("caption"));
			if (scene == null || !english(scene) || caption == null) {
				return Optional.empty();
			}
			String dialogue = text(p.path("dialogue"));
			scenes.add(new Scene(scene, cut(caption, MAX_CAPTION), dialogue == null ? null : cut(dialogue, MAX_DIALOGUE)));
		}
		return Optional.of(new ComicScript(character, List.copyOf(scenes)));
	}

	/** 비었거나 문자열이 아니면 null. 모델이 "null" 이라는 글자를 쓰는 일이 있어 그것도 없음으로 본다 */
	private static String text(JsonNode node) {
		if (node == null || !node.isString()) {
			return null;
		}
		String s = node.asString().strip();
		return s.isEmpty() || s.equalsIgnoreCase("null") ? null : s;
	}

	static boolean english(String s) {
		return !HANGUL.matcher(s).find();
	}

	/** 글자(코드 포인트) 수로 자른다. 이모지가 반으로 갈리지 않게 */
	static String cut(String s, int max) {
		if (s.codePointCount(0, s.length()) <= max) {
			return s;
		}
		return s.substring(0, s.offsetByCodePoints(0, max));
	}
}
