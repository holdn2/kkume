package com.kkume.server.comic;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * 대본 — 프롬프트와 결과 검사. 인물 방식은 문서 094의 D(참조 그림)다(문서 100 2장, 2026-10-27 사용자 결정).
 *
 * <p>대본은 인물마다 이름표 · 생김새({@code cast})를 정하고, 컷 문장은 인물을 이름표로만 부른다. 그림은
 * 인물을 한 줄로 세운 기준 그림 한 장 → 컷 넷을 따로(그 컷 인물의 기준 그림 조각을 참조로) 그린다. 2×2 한 장에 네 컷을
 * 그리면 참조를 줘도 인물의 행동 · 생김새가 섞였다(10-27 실측, 꿈 3개 모두) — 컷을 따로 그려야 섞임이 사라졌다.
 *
 * <p>검사: 컷이 정확히 4개인지, 인물 · 장면이 영어인지(그림 모델은 한국어를 읽지 못한다), 첫 인물이 꿈꾼 사람 {@code ME}인지.
 * 해설 30자 · 대사 20자를 넘으면 자른다. 어기면 한 번 다시 부르고, 두 번째도 어기면 실패다.
 *
 * <p>해설 말투({@link #spokenCaption})는 따로 본다. 말하듯 끝나면("~었어" · "~요") 한 번 다시 부르지만, 두 번째도 말투만
 * 어긋났으면 그대로 받는다 — 말투 때문에 만화를 못 받는 것보다 낫다(083 · 081 06장 보강).
 */
public record ComicScript(List<Member> cast, List<Scene> scenes) {

	public static final int PANELS = 4;

	/** 인물 수 상한. 넘으면 앞의 넷만 쓴다 — 기준 그림 한 장에 줄 세워 잘라 쓰므로 많으면 조각이 너무 좁다 */
	static final int MAX_CAST = 4;

	/** 꿈꾼 사람의 이름표. 대본은 언제나 첫 인물을 이 이름으로 둔다 */
	static final String DREAMER = "ME";

	static final int MAX_CAPTION = 30;

	static final int MAX_DIALOGUE = 20;

	/** 인물 하나. {@code name}은 대문자 이름표, {@code look}은 영어 생김새 한 문장 */
	public record Member(String name, String look) {
	}

	/** 컷 하나. {@code who}는 이 컷에 나오는 이름표(인물 순서) */
	public record Scene(String scene, List<String> who, String caption, String dialogue) {
	}

	/** 앱에 보내는 컷. 그림 위에 얹는다 */
	public record Panel(String caption, String dialogue) {
	}

	static final String SYSTEM = """
			You turn a Korean dream journal entry into a 4-panel comic script.
			Return ONLY a JSON object, no markdown, with this shape:
			{"cast": [{"name": "<short UPPERCASE English label, e.g. ME, CAT, GRANDMA>", "look": "<ENGLISH ONLY, no Hangul. One sentence: species or age and gender, hair or fur, and one outfit with clear colors. e.g. a young woman with long black hair in a yellow raincoat and blue jeans>"}],
			 "panels": [{"scene": "<ENGLISH ONLY, no Hangul. 1-2 sentences. Start with the place and describe it, then what happens. No text or letters in the image>",
			             "who": ["<cast names that appear in this panel>"],
			             "caption": "<Korean narration, max 30 characters>",
			             "dialogue": "<Korean line a character says, max 20 characters, or null>"}]}
			The first cast member is the dreamer and is always named ME. Add every other person or animal that appears, at most 4 cast members in total. Every cast member must look clearly different from the others.
			In every "scene", refer to characters ONLY by their cast name in capitals (e.g. "In a yellow city bus above the clouds, CAT drives while ME sits in the back seat"). Never use pronouns (he, she, they, it, him, her, his, their) and never describe a character's looks inside "scene". Each sentence names who does the action.
			"cast" looks and every "scene" are read by an image model that does not understand Korean: translate them into English even though the dream is written in Korean. A single Hangul character in "cast" or "scene" makes the whole answer invalid.
			Keep the dream's own events; do not add new plot. Every caption is plain written-style Korean past tense ending in ~했다 / ~였다 / ~었다 (diary narration, e.g. "복도가 끝없이 길어졌다"). Never use spoken endings like ~었어, ~했어, ~요, ~어요.
			Only "caption" and "dialogue" are Korean.
			Exactly 4 panels in story order.""";

	/**
	 * 대본 시스템 프롬프트. 앱이 주인공 성별을 보냈으면 끝에 한 줄을 붙인다(문서 088). 그림 프롬프트는 그대로 —
	 * ME 의 생김새가 기준 그림이 되므로 그림도 따라온다.
	 */
	static String system(String gender) {
		return switch (gender == null ? "" : gender) {
			case "female" -> SYSTEM + "\nThe dreamer ME is a woman: the look of ME must describe a woman.";
			case "male" -> SYSTEM + "\nThe dreamer ME is a man: the look of ME must describe a man.";
			default -> SYSTEM;
		};
	}

	/** 해설 끝의 문장부호 · 공백 · 이모지 따위 */
	private static final Pattern TRAILING = Pattern.compile("[^가-힣0-9A-Za-z]+$");

	/** 끝 글자와 상관없이 말투로 보는 어미 */
	private static final Pattern SPOKEN_ENDINGS = Pattern.compile("(거야|잖아|는데|야|요|죠)$");

	private static final Pattern HANGUL = Pattern.compile("[\\u1100-\\u11FF\\u3130-\\u318F\\uAC00-\\uD7A3]");

	private static final Pattern NAME = Pattern.compile("[A-Z][A-Z0-9_]{0,19}");

	private static final Pattern OBJECT = Pattern.compile("\\{[\\s\\S]*\\}");

	private static final String NO_TEXT = "Absolutely no text, no letters, no speech bubbles anywhere.";

	private static final String NO_TEXT_REMINDER =
			"Reminder: no speech bubbles, no text, no letters, no signs or writing anywhere in the image.";

	/** 꿈 제목 · 본문만 보낸다(081 05장 — 처리방침에 적는 범위) */
	static String userMessage(String title, String dreamText) {
		return title == null || title.isBlank() ? dreamText : title.strip() + "\n\n" + dreamText;
	}

	/**
	 * 기준 그림 — 인물을 왼쪽부터 {@link #cast} 순서로 한 줄에 세운다. 서버가 이 그림을 인물 수만큼 세로로 잘라
	 * 컷마다 참조로 넣는다({@link ComicImages#split}).
	 */
	String lineupPrompt(String style) {
		StringBuilder who = new StringBuilder();
		for (int i = 0; i < this.cast.size(); i++) {
			who.append(i == 0 ? "" : "; ").append(i + 1).append(". ").append(this.cast.get(i).look());
		}
		return String.join(" ",
				"Character reference sheet: the characters stand side by side in one row on a plain white background,"
						+ " full body, facing forward, evenly spaced, nothing else in the picture, no text, no labels.",
				"From left to right: " + who + ".",
				"Art style: " + styleText(style) + ".");
	}

	/**
	 * 컷 하나의 그림 프롬프트. 참조 그림은 {@link Scene#who} 순서로 넣는다 — "image 1 is ME" 처럼 순서로 짝짓는다.
	 * 한 컷 안을 다시 나누거나(10-27 실측 1/12) 배경을 비우는 일이 있어 둘 다 막는다.
	 */
	String panelPrompt(int index, String style) {
		Scene s = this.scenes.get(index);
		List<String> lines = new ArrayList<>();
		lines.add("A single square comic panel illustration showing one scene that fills the whole square, no borders, not split into smaller panels.");
		lines.add(NO_TEXT);
		if (s.who().isEmpty()) {
			lines.add("No people or animals in this panel.");
		}
		else {
			StringBuilder refs = new StringBuilder();
			for (int i = 0; i < s.who().size(); i++) {
				String name = s.who().get(i);
				refs.append(i == 0 ? "" : "; ").append("image ").append(i + 1).append(" is ").append(name)
					.append(" (").append(look(name)).append(")");
			}
			lines.add("Characters in this panel, one reference image each: " + refs + ".");
			lines.add("Draw each character exactly like their own reference image; never give one character's face, hair, fur,"
					+ " clothes or colors to another, and draw each character only once.");
		}
		lines.add("Draw the place of the scene in detail as the background.");
		lines.add("Art style: " + styleText(style) + ".");
		lines.add("Scene: " + s.scene());
		lines.add(NO_TEXT_REMINDER);
		return String.join(" ", lines);
	}

	private String look(String name) {
		return this.cast.stream().filter(m -> m.name().equals(name)).map(Member::look).findFirst().orElse("");
	}

	/** 이름표가 인물 목록의 몇 번째인지(기준 그림에서 왼쪽부터) */
	int castIndex(String name) {
		for (int i = 0; i < this.cast.size(); i++) {
			if (this.cast.get(i).name().equals(name)) {
				return i;
			}
		}
		return -1;
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
		return Optional.ofNullable(check(json, content).script());
	}

	/**
	 * 검사 결과. 어긋났으면 {@code problem}에 어느 검사에 걸렸는지만 담는다 — 원가 기록에 남기는 것은 이 이름뿐이고
	 * 대본 원문은 남기지 않는다(꿈 내용이 들어 있다).
	 *
	 * @param problem {@code empty} · {@code no_json} · {@code bad_json} · {@code no_cast} · {@code cast_name}
	 *     · {@code cast_look} · {@code cast_hangul} · {@code panel_count} · {@code no_scene} · {@code scene_hangul}
	 *     · {@code no_caption}. 맞으면 null
	 */
	record Checked(ComicScript script, String problem) {

		static Checked invalid(String problem) {
			return new Checked(null, problem);
		}
	}

	static Checked check(JsonMapper json, String content) {
		if (content == null || content.isBlank()) {
			return Checked.invalid("empty");
		}
		Matcher m = OBJECT.matcher(content);
		if (!m.find()) {
			return Checked.invalid("no_json");
		}
		JsonNode root;
		try {
			root = json.readTree(m.group());
		}
		catch (RuntimeException ex) {
			return Checked.invalid("bad_json");
		}
		JsonNode castNode = root.path("cast");
		if (!castNode.isArray() || castNode.isEmpty()) {
			return Checked.invalid("no_cast");
		}
		List<Member> cast = new ArrayList<>();
		Set<String> names = new LinkedHashSet<>();
		for (JsonNode c : castNode) {
			if (cast.size() == MAX_CAST) {
				break;
			}
			String name = text(c.path("name"));
			name = name == null ? null : name.toUpperCase(Locale.ROOT);
			if (name == null || !NAME.matcher(name).matches() || !names.add(name)) {
				return Checked.invalid("cast_name");
			}
			String look = text(c.path("look"));
			if (look == null) {
				return Checked.invalid("cast_look");
			}
			if (!english(look)) {
				return Checked.invalid("cast_hangul");
			}
			cast.add(new Member(name, look));
		}
		if (!cast.get(0).name().equals(DREAMER)) {
			return Checked.invalid("cast_name");
		}
		JsonNode panels = root.path("panels");
		if (!panels.isArray() || panels.size() != PANELS) {
			return Checked.invalid("panel_count");
		}
		List<Scene> scenes = new ArrayList<>();
		for (JsonNode p : panels) {
			String scene = text(p.path("scene"));
			String caption = text(p.path("caption"));
			if (scene == null) {
				return Checked.invalid("no_scene");
			}
			if (!english(scene)) {
				return Checked.invalid("scene_hangul");
			}
			if (caption == null) {
				return Checked.invalid("no_caption");
			}
			String dialogue = text(p.path("dialogue"));
			scenes.add(new Scene(scene, who(p.path("who"), scene, cast), cut(caption, MAX_CAPTION),
					dialogue == null ? null : cut(dialogue, MAX_DIALOGUE)));
		}
		return new Checked(new ComicScript(List.copyOf(cast), List.copyOf(scenes)), null);
	}

	/**
	 * 컷에 나오는 인물. 대본의 {@code who}에 있거나 장면 문장에 이름표가 나오면 넣는다 — 모델이 {@code who}를 빠뜨려도
	 * 장면에 나온 인물의 참조 그림이 빠지지 않게. 모르는 이름은 버린다. 인물 목록 순서로 돌려준다.
	 */
	private static List<String> who(JsonNode listed, String scene, List<Member> cast) {
		Set<String> said = new LinkedHashSet<>();
		if (listed.isArray()) {
			for (JsonNode n : listed) {
				String s = text(n);
				if (s != null) {
					said.add(s.toUpperCase(Locale.ROOT));
				}
			}
		}
		List<String> out = new ArrayList<>();
		for (Member c : cast) {
			if (said.contains(c.name()) || Pattern.compile("\\b" + c.name() + "\\b").matcher(scene).find()) {
				out.add(c.name());
			}
		}
		return List.copyOf(out);
	}

	/** 비었거나 문자열이 아니면 null. 모델이 "null" 이라는 글자를 쓰는 일이 있어 그것도 없음으로 본다 */
	private static String text(JsonNode node) {
		if (node == null || !node.isString()) {
			return null;
		}
		String s = node.asString().strip();
		return s.isEmpty() || s.equalsIgnoreCase("null") ? null : s;
	}

	boolean spokenCaption() {
		return this.scenes.stream().anyMatch(s -> spoken(s.caption()));
	}

	/**
	 * 해설이 말하는 어미로 끝나는가. "~었어" · "~졌어" · "~갔어"처럼 줄어든 꼴이 많아 어미 목록 대신
	 * <b>끝 글자가 "어"이고 바로 앞 글자의 받침이 ㅆ(과거)</b>인지로 본다. "고등어"처럼 "어"로 끝나는 명사는 앞 받침이 ㅆ이 아니라 걸리지 않는다
	 */
	static boolean spoken(String caption) {
		String t = TRAILING.matcher(caption).replaceAll("");
		if (t.isEmpty()) {
			return false;
		}
		if (SPOKEN_ENDINGS.matcher(t).find()) {
			return true;
		}
		if (t.length() >= 2 && t.charAt(t.length() - 1) == '어') {
			char before = t.charAt(t.length() - 2);
			return before >= '가' && before <= '힣' && (before - '가') % 28 == 20;
		}
		return false;
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
