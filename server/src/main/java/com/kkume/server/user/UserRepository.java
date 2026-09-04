package com.kkume.server.user;

import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

public interface UserRepository extends JpaRepository<User, UUID> {

	/** 소셜 토큰을 검증한 뒤 기존 사용자를 찾는 경로다(5주차 인증) */
	Optional<User> findByProviderAndProviderId(Provider provider, String providerId);
}
