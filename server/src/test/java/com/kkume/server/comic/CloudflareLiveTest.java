package com.kkume.server.comic;

import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.Map;
import java.util.stream.Collectors;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.web.client.RestClient;

import tools.jackson.databind.json.JsonMapper;

/**
 * 진짜 Workers AI 에 한 편을 그려 본다(약 150뉴런 — 무료 한도 하루 10,000 안). 평소에는 돌지 않는다.
 *
 * <pre>KKUME_CF_KEY_FILE=/d/_kkume/secrets/cloudflare.key.txt ./gradlew test --tests '*CloudflareLiveTest'</pre>
 *
 * 키 파일은 {@code ACCOUNT_ID=…} · {@code API_TOKEN=…} 두 줄이다. 내용은 출력하지 않는다. 꿈은 시험용 문장이다.
 * 그린 그림은 {@code build/comic-live.jpg}에 남긴다 — 눈으로 본다.
 */
@EnabledIfEnvironmentVariable(named = "KKUME_CF_KEY_FILE", matches = ".+")
class CloudflareLiveTest {

	@Test
	void 대본과_그림을_한_번씩_만든다() throws Exception {
		Map<String, String> key = Files.readAllLines(Path.of(System.getenv("KKUME_CF_KEY_FILE"))).stream()
			.map(String::strip)
			.filter(l -> !l.startsWith("#") && l.contains("="))
			.collect(Collectors.toMap(l -> l.substring(0, l.indexOf('=')).strip(), l -> l.substring(l.indexOf('=') + 1).strip(),
					(a, b) -> a));
		JsonMapper json = JsonMapper.builder().build();
		CloudflareComicAi ai = CloudflareComicAi.create(RestClient.builder(), json, new ComicProperties.Cloudflare(
				key.get("ACCOUNT_ID"), key.get("API_TOKEN"), "@cf/openai/gpt-oss-120b",
				"@cf/black-forest-labs/flux-2-klein-4b", Duration.ofSeconds(90)));

		ComicAi.Reply<String> reply = ai.script(ComicScript.SYSTEM, ComicScript.userMessage("버스 꿈",
				"버스를 탔는데 기사님이 고양이였다. 고양이 기사님은 정류장마다 생선을 하나씩 받았다. 마지막 정류장은 달이었다."));
		Files.writeString(Path.of("build/comic-live-raw.txt"), reply.value());
		ComicScript script = ComicScript.parse(json, reply.value()).orElse(null);
		System.out.println("대본 " + reply.usage().durationMs() + "ms, 토큰 " + reply.usage().inputTokens() + "/"
				+ reply.usage().outputTokens() + ", $" + reply.usage().usd() + ", 계약 " + (script != null));
		assertThat(script).isNotNull();
		Files.writeString(Path.of("build/comic-live.txt"), script.panels().stream()
			.map(p -> p.caption() + (p.dialogue() == null ? "" : " 「" + p.dialogue() + "」")).collect(Collectors.joining("\n")));

		ComicAi.Reply<byte[]> image = ai.draw(script.gridPrompt("soft"));
		System.out.println("그림 " + image.usage().durationMs() + "ms, " + image.value().length + " bytes, $" + image.usage().usd());
		assertThat(image.value()).startsWith((byte) 0xFF, (byte) 0xD8);
		Files.write(Path.of("build/comic-live.jpg"), image.value());
	}
}
