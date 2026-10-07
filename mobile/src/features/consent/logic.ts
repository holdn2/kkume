/**
 * 가입 동의(이슈 #71). 로그인(가입) 직전에 셋을 받는다 — 만 14세 이상 · 이용약관 · 개인정보 수집 · 이용.
 *
 * - 전에는 "로그인하면 동의한 것으로 봅니다" 한 줄뿐이었고, 방침에 "만 14세 미만은 가입할 수 없다"고 적어 놓고
 *   나이를 묻지 않았다. App Store 가이드라인 1.2도 이용자가 글을 올리는 앱은 약관 동의를 받으라고 한다
 * - **버전이 바뀌면 다시 받는다** — 공개 페이지(`site/`)의 시행일과 같은 값이다. 문서를 고치면 이것도 올린다
 * - 기록은 폰 설정(`SETTINGS.consent`)에 `{ version, at }`. 서버에 남기는 것은 서버 요청(문서 068)이다
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

/** 설정에 저장할 값 */
export function recordConsent(at: Date = new Date()): string {
  return JSON.stringify({ version: CONSENT_VERSION, at: at.toISOString() });
}
