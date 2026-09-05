package com.kkume.server.user;

import java.time.Instant;
import java.util.UUID;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.kkume.server.auth.SocialIdentity;

@Service
public class UserService {

	private final UserRepository users;

	private final UserSettingsRepository settings;

	private final NicknameGenerator nicknames;

	public UserService(UserRepository users, UserSettingsRepository settings, NicknameGenerator nicknames) {
		this.users = users;
		this.settings = settings;
		this.nicknames = nicknames;
	}

	/**
	 * 소셜 신원으로 사용자를 찾고 없으면 만든다.
	 *
	 * <p>가입과 로그인을 나누지 않는다. 앱에는 "회원가입" 화면이 없고 소셜 로그인 하나뿐이라,
	 * 처음 온 사람과 다시 온 사람을 화면에서 구분할 이유가 없다.
	 *
	 * <p>설정 행도 여기서 함께 만든다. 나중에 설정을 읽는 쪽마다 "없으면 만들기"를
	 * 넣게 되면 그 중 하나를 빠뜨린다.
	 */
	@Transactional
	public User findOrCreate(SocialIdentity identity) {
		return this.users.findByProviderAndProviderId(identity.provider(), identity.providerId())
			.orElseGet(() -> create(identity));
	}

	private User create(SocialIdentity identity) {
		Instant now = Instant.now();
		User user = this.users.save(new User(UUID.randomUUID(), identity.provider(),
				identity.providerId(), this.nicknames.generate(), now));
		this.settings.save(new UserSettings(user.getId(), now));
		return user;
	}

	@Transactional(readOnly = true)
	public User get(UUID id) {
		return this.users.findById(id).orElseThrow(() -> new UnknownUserException(id));
	}

	/** 토큰은 유효한데 그 사용자가 없다. 계정을 지웠거나 DB가 갈린 상황이다. */
	public static class UnknownUserException extends RuntimeException {

		public UnknownUserException(UUID id) {
			super("사용자를 찾지 못했습니다: " + id);
		}
	}
}
