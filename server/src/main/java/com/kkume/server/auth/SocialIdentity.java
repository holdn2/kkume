package com.kkume.server.auth;

import com.kkume.server.user.Provider;

/**
 * 소셜 토큰을 검증해서 얻은 신원.
 *
 * <p>이름이나 프로필 사진은 담지 않는다. 꿈은 사적인 내용이라 실명이 딸려오는 것을
 * 피하고 닉네임을 랜덤으로 부여한다(계획서 08장).
 *
 * @param provider 어느 소셜인지
 * @param providerId 그 소셜에서의 사용자 식별자. 구글은 {@code sub} 다
 */
public record SocialIdentity(Provider provider, String providerId) {
}
