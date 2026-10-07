import { requireOptionalNativeModule } from 'expo-modules-core';

/**
 * 세션 토큰 보관.
 *
 * `expo-secure-store`는 Expo 모듈이라 절대 규칙 10의 `requireOptionalNativeModule`이
 * 그대로 통한다(구글 로그인 쪽과 다르다 — 거기 이유는 `google.ts`에 적었다).
 *
 * **없으면 메모리로 물러선다.** 토큰이 안 남아 다시 로그인해야 할 뿐,
 * 기록은 로컬 SQLite에 있으므로 잃는 것이 없다(절대 규칙 1).
 */
const HAS_SECURE_STORE = requireOptionalNativeModule('ExpoSecureStore') != null;

export function sessionBackend(): 'secure-store' | 'memory' {
  return HAS_SECURE_STORE ? 'secure-store' : 'memory';
}

const KEY = 'kkume.session';

export type Session = {
  accessToken: string;
  /** ISO 문자열. 서버가 준 `expiresIn`(초)을 받은 시각에 더해 둔 것이다 */
  expiresAt: string;
  /** `consentVersion` — 로그인 응답 · 동의 기록 뒤의 서버 값. 이 필드가 생기기 전에 저장한 세션에는 없다(`undefined` = 모름) */
  user: { id: string; nickname: string; consentVersion?: string | null };
};

let memory: Session | null = null;

function store() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('expo-secure-store');
}

export async function loadSession(): Promise<Session | null> {
  if (!HAS_SECURE_STORE) return memory;
  try {
    const raw = await store().getItemAsync(KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    // 키체인이 잠겨 있거나 값이 깨진 경우다. 지우지는 않는다 —
    // 다음 실행에 읽히는 일이 있고, 지우면 그 기회가 사라진다
    return null;
  }
}

export async function saveSession(s: Session): Promise<void> {
  if (!HAS_SECURE_STORE) {
    memory = s;
    return;
  }
  await store().setItemAsync(KEY, JSON.stringify(s));
}

export async function clearSession(): Promise<void> {
  memory = null;
  if (!HAS_SECURE_STORE) return;
  try {
    await store().deleteItemAsync(KEY);
  } catch {
    /* 이미 없으면 그만이다 */
  }
}

/**
 * 만료를 **1분 앞당겨** 본다. 정확히 만료 시각에 걸친 요청이 401로 돌아오면
 * 사용자에게는 "방금까지 되던 것이 갑자기 안 되는" 일이 된다.
 */
export function isExpired(s: Session, now = Date.now()): boolean {
  const at = Date.parse(s.expiresAt);
  if (!Number.isFinite(at)) return true;
  return at - 60_000 <= now;
}

export function toSession(
  res: { accessToken: string; expiresIn: number; user: { id: string; nickname: string; consentVersion?: string | null } },
  now = Date.now(),
): Session {
  return {
    accessToken: res.accessToken,
    expiresAt: new Date(now + res.expiresIn * 1000).toISOString(),
    user: res.user,
  };
}
