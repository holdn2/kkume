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

	@Test
	void 제목이_있으면_본문_앞에_붙인다() {
		assertThat(ComicScript.userMessage("제목", "본문")).isEqualTo("제목\n\n본문");
		assertThat(ComicScript.userMessage(" ", "본문")).isEqualTo("본문");
	}
}
