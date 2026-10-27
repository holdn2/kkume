package com.kkume.server.comic;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

import tools.jackson.databind.json.JsonMapper;

/** 대본 검사(문서 081 06장 "서버가 검사할 것") · 인물 방식 D(문서 100 2장) */
class ComicScriptTest {

	private final JsonMapper json = JsonMapper.builder().build();

	private static final String GOOD = FakeComicAi.GOOD_SCRIPT;

	@Test
	void 앞뒤에_말이_붙어도_가장_바깥_객체를_읽는다() {
		ComicScript s = ComicScript.parse(this.json, "다음과 같습니다:\n```json\n" + GOOD + "\n```").orElseThrow();
		assertThat(s.cast()).extracting(ComicScript.Member::name).containsExactly("ME", "PUPPY");
		assertThat(s.cast().get(0).look()).startsWith("a young adult");
		assertThat(s.scenes()).hasSize(4);
		assertThat(s.panels().get(3).dialogue()).isEqualTo("늦었잖아");
	}

	@Test
	void 컷이_4개가_아니면_어긋난_것이다() {
		String three = GOOD.replaceFirst(",\\s*\\{\"scene\":\"Behind the last door[^}]*\\}", "");
		assertThat(ComicScript.parse(this.json, three)).isEmpty();
	}

	@Test
	void 인물이나_장면에_한글이_있으면_어긋난_것이다() {
		assertThat(ComicScript.parse(this.json, GOOD.replace("grey hoodie", "회색 후드"))).isEmpty();
		assertThat(ComicScript.parse(this.json, GOOD.replace("bright blue sea", "파란 바다"))).isEmpty();
	}

	@Test
	void 어긋나면_걸린_검사_이름을_돌려준다() {
		assertThat(ComicScript.check(this.json, GOOD).problem()).isNull();
		assertThat(ComicScript.check(this.json, null).problem()).isEqualTo("empty");
		assertThat(ComicScript.check(this.json, " ").problem()).isEqualTo("empty");
		assertThat(ComicScript.check(this.json, "만들 수 없습니다").problem()).isEqualTo("no_json");
		assertThat(ComicScript.check(this.json, "{not json}").problem()).isEqualTo("bad_json");
		assertThat(ComicScript.check(this.json, "{\"panels\":[]}").problem()).isEqualTo("no_cast");
		assertThat(ComicScript.check(this.json, "{\"cast\":[],\"panels\":[]}").problem()).isEqualTo("no_cast");
		// 첫 인물은 꿈꾼 사람 ME · 이름표는 영어 대문자 · 겹치지 않음
		assertThat(ComicScript.check(this.json, GOOD.replace("\"name\":\"ME\"", "\"name\":\"DREAMER\"")).problem())
			.isEqualTo("cast_name");
		assertThat(ComicScript.check(this.json, GOOD.replace("\"name\":\"PUPPY\"", "\"name\":\"ME\"")).problem())
			.isEqualTo("cast_name");
		assertThat(ComicScript.check(this.json, GOOD.replace("\"name\":\"PUPPY\"", "\"name\":\"강아지\"")).problem())
			.isEqualTo("cast_name");
		assertThat(ComicScript.check(this.json, GOOD.replace("\"a small white puppy with a red collar\"", "null")).problem())
			.isEqualTo("cast_look");
		assertThat(ComicScript.check(this.json, GOOD.replace("grey hoodie", "회색 후드")).problem()).isEqualTo("cast_hangul");
		assertThat(ComicScript.check(this.json, "{\"cast\":[{\"name\":\"ME\",\"look\":\"x\"}],\"panels\":[]}").problem())
			.isEqualTo("panel_count");
		assertThat(ComicScript.check(this.json, GOOD.replace("\"Another door shows the same ocean.\"", "null")).problem())
			.isEqualTo("no_scene");
		assertThat(ComicScript.check(this.json, GOOD.replace("bright blue sea", "파란 바다")).problem()).isEqualTo("scene_hangul");
		assertThat(ComicScript.check(this.json, GOOD.replace("\"복도를 걸었는데 길이 끝없이 늘어났다\"", "\"\"")).problem())
			.isEqualTo("no_caption");
	}

	@Test
	void 이름표는_대문자로_맞추고_컷_인물은_who_와_장면에_나온_이름을_인물_순서로_모은다() {
		ComicScript s = ComicScript.parse(this.json, GOOD.replace("\"name\":\"PUPPY\"", "\"name\":\"puppy\"")
			.replace("\"who\":[\"ME\"],\"caption\":\"첫", "\"who\":[\"GHOST\",\"me\"],\"caption\":\"첫")).orElseThrow();
		assertThat(s.cast().get(1).name()).isEqualTo("PUPPY");
		assertThat(s.scenes().get(0).who()).containsExactly("ME");
		// 모르는 이름(GHOST)은 버린다
		assertThat(s.scenes().get(1).who()).containsExactly("ME");
		assertThat(s.scenes().get(2).who()).isEmpty();
		// who 에는 PUPPY 만 적었지만 장면 문장에 ME 가 나온다
		assertThat(s.scenes().get(3).who()).containsExactly("ME", "PUPPY");
		assertThat(s.castIndex("PUPPY")).isEqualTo(1);
	}

	@Test
	void 인물이_넷을_넘으면_앞의_넷만_쓴다() {
		String many = GOOD.replace("{\"name\":\"PUPPY\",\"look\":\"a small white puppy with a red collar\"}",
				"{\"name\":\"PUPPY\",\"look\":\"a puppy\"},{\"name\":\"CAT\",\"look\":\"a cat\"},{\"name\":\"OWL\",\"look\":\"an owl\"},"
						+ "{\"name\":\"FOX\",\"look\":\"a fox\"}");
		ComicScript s = ComicScript.parse(this.json, many).orElseThrow();
		assertThat(s.cast()).extracting(ComicScript.Member::name).containsExactly("ME", "PUPPY", "CAT", "OWL");
	}

	@Test
	void JSON_이_아니거나_비었으면_어긋난_것이다() {
		assertThat(ComicScript.parse(this.json, "만들 수 없습니다")).isEmpty();
		assertThat(ComicScript.parse(this.json, "{not json}")).isEmpty();
		assertThat(ComicScript.parse(this.json, null)).isEmpty();
		assertThat(ComicScript.parse(this.json, GOOD.replace("\"복도를 걸었는데 길이 끝없이 늘어났다\"", "\"\""))).isEmpty();
	}

	@Test
	void 해설은_30자_대사는_20자에서_자른다() {
		String longCaption = "가".repeat(40);
		String longLine = "나".repeat(25);
		String s = GOOD.replace("복도를 걸었는데 길이 끝없이 늘어났다", longCaption).replace("바다다!", longLine);
		ComicScript script = ComicScript.parse(this.json, s).orElseThrow();
		assertThat(script.panels().get(0).caption()).hasSize(30);
		assertThat(script.panels().get(1).dialogue()).hasSize(20);
	}

	@Test
	void 자를_때_이모지를_반으로_가르지_않는다() {
		assertThat(ComicScript.cut("😀".repeat(25), 20)).isEqualTo("😀".repeat(20));
	}

	private ComicScript withCaption(String caption) {
		return ComicScript.parse(this.json, GOOD.replace("복도를 걸었는데 길이 끝없이 늘어났다", caption)).orElseThrow();
	}

	@Test
	void 해설이_말하는_어미로_끝나면_말투가_어긋난_것이다() {
		assertThat(withCaption("기사님이 고양이였어").spokenCaption()).isTrue();
		assertThat(withCaption("생선을 받았어요.").spokenCaption()).isTrue();
		assertThat(withCaption("달에 도착했어!").spokenCaption()).isTrue();
		assertThat(withCaption("정말 신기했죠 😀").spokenCaption()).isTrue();
		assertThat(ComicScript.spoken("복도가 끝없이 길어졌어")).isTrue();
		assertThat(ComicScript.spoken("학교에 갔어")).isTrue();
		assertThat(ComicScript.spoken("하늘을 봤어...")).isTrue();
		assertThat(ComicScript.spoken("이상한 꿈이야")).isTrue();
	}

	@Test
	void 글말_과거형이나_어로_끝나는_명사는_괜찮다() {
		assertThat(withCaption("복도가 끝없이 길어졌다").spokenCaption()).isFalse();
		assertThat(withCaption("기사님은 고양이였다.").spokenCaption()).isFalse();
		assertThat(withCaption("냉장고 속 고등어").spokenCaption()).isFalse();
		assertThat(ComicScript.spoken("하늘을 날았다!")).isFalse();
		assertThat(ComicScript.spoken("마지막 정류장은 달")).isFalse();
		assertThat(ComicScript.spoken("기다리던 강아지")).isFalse();
		assertThat(ComicScript.spoken("바다 위로 떠오른 해")).isFalse();
		assertThat(ComicScript.spoken("")).isFalse();
		assertThat(ComicScript.SYSTEM).contains("Never use spoken endings", "ENGLISH ONLY, no Hangul",
				"translate them into English even though the dream is written in Korean");
	}

	@Test
	void 대본_프롬프트는_인물을_이름표로만_부르고_대명사를_막는다() {
		assertThat(ComicScript.SYSTEM).contains("The first cast member is the dreamer and is always named ME",
				"at most 4 cast members", "refer to characters ONLY by their cast name in capitals",
				"Never use pronouns", "Start with the place");
	}

	@Test
	void 기준_그림은_인물을_왼쪽부터_순서대로_세운다() {
		ComicScript s = ComicScript.parse(this.json, GOOD).orElseThrow();
		assertThat(s.lineupPrompt("ink")).contains("Character reference sheet", "plain white background",
				"From left to right: 1. a young adult with short black hair wearing a grey hoodie; 2. a small white puppy with a red collar.",
				"black and white ink manga style");
	}

	@Test
	void 컷_프롬프트는_그_컷_인물만_참조로_짝짓고_글자_금지로_끝난다() {
		ComicScript s = ComicScript.parse(this.json, GOOD).orElseThrow();
		String last = s.panelPrompt(3, "soft");
		assertThat(last).contains("not split into smaller panels",
				"image 1 is ME (a young adult with short black hair wearing a grey hoodie); image 2 is PUPPY (a small white puppy with a red collar)",
				"Draw the place of the scene in detail", "Scene: Behind the last door, PUPPY waits for ME.", "pastel watercolor");
		assertThat(last).endsWith("Reminder: no speech bubbles, no text, no letters, no signs or writing anywhere in the image.");
		assertThat(s.panelPrompt(2, "soft")).contains("No people or animals in this panel.").doesNotContain("image 1");
	}

	@Test
	void 제목이_있으면_본문_앞에_붙인다() {
		assertThat(ComicScript.userMessage("제목", "본문")).isEqualTo("제목\n\n본문");
		assertThat(ComicScript.userMessage(" ", "본문")).isEqualTo("본문");
	}
}
