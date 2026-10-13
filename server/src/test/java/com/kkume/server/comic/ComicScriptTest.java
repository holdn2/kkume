package com.kkume.server.comic;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

import tools.jackson.databind.json.JsonMapper;

/** 대본 검사(문서 081 06장 "서버가 검사할 것") */
class ComicScriptTest {

	private final JsonMapper json = JsonMapper.builder().build();

	@Test
	void 앞뒤에_말이_붙어도_가장_바깥_객체를_읽는다() {
		ComicScript s = ComicScript.parse(this.json, "다음과 같습니다:\n```json\n" + FakeComicAi.GOOD_SCRIPT + "\n```").orElseThrow();
		assertThat(s.character()).startsWith("a young adult");
		assertThat(s.scenes()).hasSize(4);
		assertThat(s.panels().get(3).dialogue()).isEqualTo("늦었잖아");
	}

	@Test
	void 컷이_4개가_아니면_어긋난_것이다() {
		String three = FakeComicAi.GOOD_SCRIPT.replaceFirst(
				",\\s*\\{\"scene\":\"A small puppy[^}]*\\}", "");
		assertThat(ComicScript.parse(this.json, three)).isEmpty();
	}

	@Test
	void 인물이나_장면에_한글이_있으면_어긋난_것이다() {
		assertThat(ComicScript.parse(this.json, FakeComicAi.GOOD_SCRIPT.replace("grey hoodie", "회색 후드"))).isEmpty();
		assertThat(ComicScript.parse(this.json, FakeComicAi.GOOD_SCRIPT.replace("bright blue sea", "파란 바다"))).isEmpty();
	}

	@Test
	void 어긋나면_걸린_검사_이름을_돌려준다() {
		String good = FakeComicAi.GOOD_SCRIPT;
		assertThat(ComicScript.check(this.json, good).problem()).isNull();
		assertThat(ComicScript.check(this.json, null).problem()).isEqualTo("empty");
		assertThat(ComicScript.check(this.json, " ").problem()).isEqualTo("empty");
		assertThat(ComicScript.check(this.json, "만들 수 없습니다").problem()).isEqualTo("no_json");
		assertThat(ComicScript.check(this.json, "{not json}").problem()).isEqualTo("bad_json");
		assertThat(ComicScript.check(this.json, "{\"panels\":[]}").problem()).isEqualTo("no_character");
		assertThat(ComicScript.check(this.json, good.replace("grey hoodie", "회색 후드")).problem()).isEqualTo("character_hangul");
		assertThat(ComicScript.check(this.json, "{\"character\":\"x\",\"panels\":[]}").problem()).isEqualTo("panel_count");
		assertThat(ComicScript.check(this.json, good.replace("\"A long school hallway stretches endlessly.\"", "null")).problem())
			.isEqualTo("no_scene");
		assertThat(ComicScript.check(this.json, good.replace("bright blue sea", "파란 바다")).problem()).isEqualTo("scene_hangul");
		assertThat(ComicScript.check(this.json, good.replace("\"복도를 걸었는데 길이 끝없이 늘어났다\"", "\"\"")).problem())
			.isEqualTo("no_caption");
	}

	@Test
	void JSON_이_아니거나_비었으면_어긋난_것이다() {
		assertThat(ComicScript.parse(this.json, "만들 수 없습니다")).isEmpty();
		assertThat(ComicScript.parse(this.json, "{not json}")).isEmpty();
		assertThat(ComicScript.parse(this.json, null)).isEmpty();
		assertThat(ComicScript.parse(this.json, FakeComicAi.GOOD_SCRIPT.replace("\"복도를 걸었는데 길이 끝없이 늘어났다\"", "\"\""))).isEmpty();
	}

	@Test
	void 해설은_30자_대사는_20자에서_자른다() {
		String longCaption = "가".repeat(40);
		String longLine = "나".repeat(25);
		String s = FakeComicAi.GOOD_SCRIPT.replace("복도를 걸었는데 길이 끝없이 늘어났다", longCaption).replace("바다다!", longLine);
		ComicScript script = ComicScript.parse(this.json, s).orElseThrow();
		assertThat(script.panels().get(0).caption()).hasSize(30);
		assertThat(script.panels().get(1).dialogue()).hasSize(20);
	}

	@Test
	void 자를_때_이모지를_반으로_가르지_않는다() {
		assertThat(ComicScript.cut("😀".repeat(25), 20)).isEqualTo("😀".repeat(20));
	}

	private ComicScript withCaption(String caption) {
		return ComicScript.parse(this.json, FakeComicAi.GOOD_SCRIPT.replace("복도를 걸었는데 길이 끝없이 늘어났다", caption)).orElseThrow();
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
	void 대본_프롬프트는_주인공을_the_main_character_로_부르게_한다() {
		assertThat(ComicScript.SYSTEM).contains("age, gender, hair color and style, and one outfit with clear colors",
				"In every scene call the dreamer \"the main character\"",
				"Whenever another person or animal appears, describe their own look in that scene");
	}

	@Test
	void 그림_프롬프트는_컷마다_주인공_모습을_끼우고_글자_금지로_끝난다() {
		ComicScript script = ComicScript.parse(this.json, FakeComicAi.GOOD_SCRIPT
			.replace("A long school hallway stretches endlessly.", "The main character walks down a long school hallway.")
			.replace("She opens a door to a bright blue sea.", "A door opens and the Main Character sees a blue sea."))
			.orElseThrow();
		String c = "a young adult with short black hair wearing a grey hoodie";
		String prompt = script.gridPrompt("soft");
		assertThat(prompt).contains(
				"Main character, drawn identically in all four panels (same face, same hairstyle and hair color, same outfit): " + c + ".",
				"Top-left panel: The main character (" + c + ") walks down a long school hallway.",
				"Top-right panel: A door opens and the Main Character (" + c + ") sees a blue sea.",
				"Bottom-left panel: the main character (" + c + "). Another door shows the same ocean.");
		assertThat(prompt).endsWith("Reminder: no speech bubbles, no text, no letters, no signs or writing anywhere in the image.");
		// 첫 번째만 바꾼다
		assertThat(script.withCharacter("the main character waves; the main character smiles"))
			.isEqualTo("the main character (" + c + ") waves; the main character smiles");
	}

	@Test
	void 제목이_있으면_본문_앞에_붙인다() {
		assertThat(ComicScript.userMessage("제목", "본문")).isEqualTo("제목\n\n본문");
		assertThat(ComicScript.userMessage(" ", "본문")).isEqualTo("본문");
	}
}
