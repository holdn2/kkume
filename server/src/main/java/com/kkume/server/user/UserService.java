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

	private final AccountGuard accounts;

	public UserService(UserRepository users, UserSettingsRepository settings, NicknameGenerator nicknames,
			AccountGuard accounts) {
		this.accounts = accounts;
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
	/**
	 * 찾거나 만들고, 동의 버전이 있으면 <b>같은 트랜잭션에서</b> 기록한다(문서 071 · 072).
	 * 로그인 직후 따로 기록하면 그 요청이 실패했을 때 "계정은 있는데 동의 기록이 없는" 틈이 생긴다.
	 *
	 * <p>계정이 없는데 동의도 없으면 만들지 않는다(문서 074) — 동의 전에 계정이 생기지 않게.
	 * 이미 있는 계정은 동의가 없거나 옛 버전이어도 로그인시킨다. 그쪽은 앱이 로그인 뒤에 묻고
	 * {@code PUT /api/me/consent}로 올린다. 판정을 여기 두어 소셜 로그인 경로마다 같은 규칙이 된다.
	 * 지운 계정은 {@code provider_id}를 익명화해 찾히지 않으므로 "계정 없음"이다.
	 *
	 * @param consentVersion {@link #requireConsentVersion}을 지난 값이거나 {@code null}
	 * @throws ConsentRequiredException 계정이 없고 {@code consentVersion}도 없다
	 */
	@Transactional
	public User findOrCreate(SocialIdentity identity, String consentVersion) {
		User user = this.users.findByProviderAndProviderId(identity.provider(), identity.providerId())
			.orElseGet(() -> {
				if (consentVersion == null) {
					throw new ConsentRequiredException();
				}
				return create(identity);
			});
		if (consentVersion != null) {
			user.recordConsent(consentVersion, Instant.now());
		}
		return user;
	}

	/** 이미 로그인한 사람이 다시 동의했다. 정지돼도 기록한다 */
	@Transactional
	public User recordConsent(UUID id, String version) {
		String checked = requireConsentVersion(version);
		this.accounts.lockActive(id);
		User user = get(id);
		user.recordConsent(checked, Instant.now());
		return user;
	}

	/**
	 * 동의 버전은 공개 문서 시행일 모양({@code YYYY-MM-DD}). 뜻은 따지지 않는다 — 동의 버전과 문서 시행일은 달라도 된다(071).
	 *
	 * @throws InvalidConsentVersionException 모양이 다르거나 없는 날짜
	 */
	public static String requireConsentVersion(String version) {
		if (version == null || !version.matches("\\d{4}-\\d{2}-\\d{2}")) {
			throw new InvalidConsentVersionException();
		}
		try {
			java.time.LocalDate.parse(version);
		}
		catch (java.time.format.DateTimeParseException ex) {
			throw new InvalidConsentVersionException();
		}
		return version;
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

	/**
	 * 닉네임을 바꾼다(문서 056 04장 4번). 앞뒤 공백을 자르고 2~16자, 줄바꿈 · 제어문자는 안 된다.
	 *
	 * <p>중복을 막지 않는다 — 닉네임은 식별자가 아니다({@link NicknameGenerator}).
	 * 글에 복사하지 않으므로 지난 글 · 댓글의 작성자 이름도 새 이름으로 보인다.
	 */
	@Transactional
	public User rename(UUID id, String nickname) {
		String name = nickname == null ? "" : nickname.strip();
		int length = name.codePointCount(0, name.length());
		if (length < 2 || length > 16 || name.codePoints().anyMatch(Character::isISOControl)) {
			throw new InvalidNicknameException();
		}
		// 지운 계정만 이 이름을 쓴다. 띄어 쓴 것도 같은 이름으로 본다(문서 066 02장)
		if (name.replaceAll("\\s", "").equals(AccountDeletionService.DELETED_NICKNAME.replaceAll("\\s", ""))) {
			throw new InvalidNicknameException();
		}
		// 삭제 뒤에 커밋하면 익명화한 이름을 원래 이름으로 덮는다. 정지된 계정은 남은 글에 보이는 이름을 바꾸지 못한다
		this.accounts.lockWritable(id);
		User user = get(id);
		user.rename(name, Instant.now());
		return user;
	}

	public static class InvalidNicknameException extends RuntimeException {

		public InvalidNicknameException() {
			super("닉네임은 2~16자이고 줄바꿈을 쓸 수 없습니다");
		}
	}

	/** 토큰은 유효한데 그 사용자가 없다. 계정을 지웠거나 DB가 갈린 상황이다. */
	public static class UnknownUserException extends RuntimeException {

		public UnknownUserException(UUID id) {
			super("사용자를 찾지 못했습니다: " + id);
		}
	}
}
