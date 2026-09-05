package com.kkume.server.user;

import java.security.SecureRandom;
import java.util.List;

import org.springframework.stereotype.Component;

/**
 * 가입할 때 붙는 닉네임을 만든다.
 *
 * <p><b>소셜 계정의 이름을 쓰지 않는다.</b> 꿈은 사적인 내용인데 구글 계정에는 실명이
 * 딸려 올 수 있다(계획서 08장). 커뮤니티 첫 게시 때 한 번 확인시키고, 사용자가
 * 나중에 바꾼다.
 *
 * <p>중복을 막지 않는다. 닉네임은 식별자가 아니고 사용자를 가리는 이름일 뿐이라
 * 같은 이름이 둘 있어도 아무것도 깨지지 않는다.
 */
@Component
public class NicknameGenerator {

	private static final List<String> WORDS = List.of(
			"잠꾸러기", "몽상가", "밤고양이", "구름사탕", "별지기", "새벽고래",
			"이불요정", "달무리", "베개도둑", "은하수", "밤바다", "선잠",
			"솜사탕구름", "물결소리", "겨울잠", "무지개꼬리", "바람개비", "느린별",
			"안개숲", "밤비", "동그란달", "잠수함", "깃털구름", "숲속등불");

	private static final int NUMBER_BOUND = 10_000;

	private final SecureRandom random = new SecureRandom();

	/** 예: {@code 잠꾸러기 3847} */
	public String generate() {
		String word = WORDS.get(this.random.nextInt(WORDS.size()));
		return "%s %04d".formatted(word, this.random.nextInt(NUMBER_BOUND));
	}
}
