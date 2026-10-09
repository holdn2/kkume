/**
 * 가입 동의(이슈 #71). 로그인(가입) 직전에 셋을 받는다 — 만 14세 이상 · 이용약관 · 개인정보 수집 · 이용.
 *
 * - 전에는 "로그인하면 동의한 것으로 봅니다" 한 줄뿐이었고, 방침에 "만 14세 미만은 가입할 수 없다"고 적어 놓고
 *   나이를 묻지 않았다. App Store 가이드라인 1.2도 이용자가 글을 올리는 앱은 약관 동의를 받으라고 한다
 * - **버전이 바뀌면 다시 받는다.** 값은 동의를 받은 문서의 시행일이다. **다시 동의가 필요한 변경일 때만 올린다** —
 *   사실을 바로잡거나 이용자에게 유리하게 좁히는 수정은 공개 페이지의 시행일만 바꾼다(문서 071 02장).
 *   그래서 이 값과 공개 페이지의 시행일은 달라질 수 있다
 * - 기록은 폰 설정(`SETTINGS.consent`)에 `{ version, at }`, 서버에는 `users.consent_version`(계약 070 · 072).
 *   로그인 요청에 실어 계정을 만드는 것과 같은 트랜잭션에 남기고, 이미 로그인한 사람은 `PUT /api/me/consent`
 */
export const CONSENT_VERSION = '2026-10-07';

export type ConsentKey = 'age' | 'terms' | 'privacy';

export const CONSENT_ITEMS: { key: ConsentKey; label: string; required: true; link?: 'terms' | 'privacy' }[] = [
  { key: 'age', label: '만 14세 이상입니다', required: true },
  { key: 'terms', label: '이용약관에 동의합니다', required: true, link: 'terms' },
  { key: 'privacy', label: '개인정보 수집 · 이용에 동의합니다', required: true, link: 'privacy' },
];

/** 이번 버전에 동의한 기록이 없으면 true. 깨진 값도 없는 것으로 본다 */
export function needsConsent(stored: string | null): boolean {
  if (!stored) return true;
  try {
    const v: unknown = JSON.parse(stored);
    return !(v && typeof v === 'object' && (v as { version?: unknown }).version === CONSENT_VERSION);
  } catch {
    return true;
  }
}

/** 필수 항목을 모두 체크했는가 */
export function canAgree(checks: Partial<Record<ConsentKey, boolean>>): boolean {
  return CONSENT_ITEMS.every((i) => !i.required || checks[i.key] === true);
}

/**
 * 로그인한 채 마이 탭을 열 때 할 일(계약 072).
 *
 * - `skip` — 서버가 이번 버전에 동의했다고 한다. **서버 값을 믿는다** — 다른 기기에서 동의했어도 묻지 않는다
 * - `upload` — 이 폰에서는 동의했는데 서버에 없다(서버가 생기기 전에 동의했거나, 올리다 실패함). 다시 묻지 않고 조용히 올린다.
 *   폰의 동의 기록은 로그아웃 · 계정 삭제 때 지우므로 이 계정의 것이다
 * - `ask` — 어디에도 이번 버전 동의가 없다
 *
 * `server`가 `undefined`면 서버 값을 모른다(오프라인 · 옛 서버) — 폰 기록만으로 정한다
 */
export function consentAction(local: string | null, server: string | null | undefined): 'skip' | 'upload' | 'ask' {
  if (server === CONSENT_VERSION) return 'skip';
  if (needsConsent(local)) return 'ask';
  return server === undefined ? 'skip' : 'upload';
}

/**
 * 꿈 기록을 서버와 주고받아도 되는가(PR #83 리뷰). 이미 있는 계정은 동의 없이도 로그인되므로(문서 074),
 * 이번 버전 동의가 폰에도 서버에도 없으면 마이 탭에서 동의할 때까지 동기화하지 않는다 — 기록은 폰에 그대로 남는다.
 *
 * `server`가 `undefined`(이 필드가 생기기 전에 저장한 세션)면 막지 않는다 — #74 전부터 동기화하던 세션이고,
 * 마이 탭을 열면 서버 값으로 채워진다
 */
export function canSync(local: string | null, server: string | null | undefined): boolean {
  return server === undefined || consentAction(local, server) !== 'ask';
}

/** 설정에 저장할 값 */
export function recordConsent(at: Date = new Date()): string {
  return JSON.stringify({ version: CONSENT_VERSION, at: at.toISOString() });
}
