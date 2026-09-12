import Constants from 'expo-constants';
import { TurboModuleRegistry } from 'react-native';

/**
 * 구글 로그인 어댑터.
 *
 * **절대 규칙 10의 `requireOptionalNativeModule`로는 이걸 못 막는다.**
 * `@react-native-google-signin/google-signin`은 Expo 모듈이 아니라 순수 RN
 * TurboModule이라 Expo 레지스트리에 없다. 그리고 라이브러리 내부가
 * `TurboModuleRegistry.getEnforcing('RNGoogleSignin')`을 쓰는데 **없으면 던진다** —
 * 규칙 10이 막으려던 빨간 ERROR가 그대로 난다.
 *
 * 그래서 던지지 않는 `TurboModuleRegistry.get`으로 **먼저 묻고, 있을 때만 `require`** 한다.
 * import를 위로 올리면 모듈을 읽는 순간 `getEnforcing`이 돌아 의미가 없다.
 */
export const HAS_NATIVE_GOOGLE = TurboModuleRegistry.get('RNGoogleSignin') != null;

export function googleBackend(): 'google-signin' | 'none' {
  return HAS_NATIVE_GOOGLE ? 'google-signin' : 'none';
}

type Extra = { googleWebClientId?: string; googleIosClientId?: string };
const extra = (Constants.expoConfig?.extra ?? {}) as Extra;

/**
 * `app.json`에 자리표시자가 남아 있는지 본다.
 *
 * **값이 없는 것보다 자리표시자가 위험하다.** 비어 있으면 라이브러리가 바로 실패하는데,
 * `CHANGE-ME`는 형식이 맞아서 **로그인 창까지 뜬 뒤 구글이 거절**한다.
 * 그러면 원인이 앱인지 서버인지 구글 설정인지 알 수 없다.
 */
const PLACEHOLDER = 'CHANGE-ME';
const isPlaceholder = (v?: string) => !v || v.includes(PLACEHOLDER);

export const AUTH_CONFIGURED = !isPlaceholder(extra.googleIosClientId) && !isPlaceholder(extra.googleWebClientId);

let configured = false;

function ensureConfigured() {
  if (configured) return;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { GoogleSignin } = require('@react-native-google-signin/google-signin');
  GoogleSignin.configure({
    // **`webClientId`가 서버와 맞는 자리다.** ID 토큰의 `aud`가 이 값으로 나오고,
    // 서버의 `kkume.auth.google.client-ids`가 그것을 대조한다. 여기가 어긋나면
    // 서버가 401을 주는데 이유를 안 알려줘서 원인을 찾기 어렵다
    webClientId: extra.googleWebClientId,
    iosClientId: extra.googleIosClientId,
  });
  configured = true;
}

export type GoogleResult =
  | { ok: true; idToken: string }
  | { ok: false; reason: 'cancelled' | 'unavailable' | 'failed'; detail?: string };

/**
 * 구글 로그인 창을 띄우고 **ID 토큰까지만** 받아 온다. 그 뒤는 서버 몫이다.
 *
 * 취소를 실패와 가른다. 사용자가 스스로 닫은 것에 오류 문구를 띄우면,
 * 자기가 뭘 잘못한 줄 알고 다시 시도하지 않는다.
 */
export async function signInWithGoogle(): Promise<GoogleResult> {
  if (!HAS_NATIVE_GOOGLE) {
    return { ok: false, reason: 'unavailable' };
  }
  if (!AUTH_CONFIGURED) {
    return { ok: false, reason: 'unavailable', detail: 'app.json의 클라이언트 ID가 자리표시자입니다' };
  }
  try {
    ensureConfigured();
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('@react-native-google-signin/google-signin');
    const { GoogleSignin, isSuccessResponse } = mod;

    await GoogleSignin.hasPlayServices();
    const res = await GoogleSignin.signIn();

    if (!isSuccessResponse(res)) return { ok: false, reason: 'cancelled' };

    let idToken: string | null = res.data?.idToken ?? null;

    if (!idToken) {
      // **한 번 더 받아 본다.** `signIn()`의 `idToken`은 타입부터 `string | null`이고,
      // iOS에서 비어 오는 경우가 있다. `getTokens()`는 토큰만 따로 받아오는 경로라
      // 여기서 나오는 일이 있다 — 없으면 그때 실패로 본다
      try {
        const t = await GoogleSignin.getTokens();
        idToken = t?.idToken ?? null;
      } catch (inner) {
        return { ok: false, reason: 'failed', detail: `getTokens 실패: ${describe(inner)}` };
      }
    }

    if (!idToken) {
      // 로그인은 됐는데 토큰이 끝내 안 왔다. `webClientId`가 웹 유형 클라이언트가
      // 아니면 이렇게 된다 — 구글은 `aud`로 쓸 대상이 없으면 ID 토큰을 만들지 않는다
      return { ok: false, reason: 'failed', detail: 'idToken이 비어 있습니다 (webClientId 확인)' };
    }
    return { ok: true, idToken };
  } catch (e) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { isErrorWithCode, statusCodes } = require('@react-native-google-signin/google-signin');
    const code = (e as { code?: string } | null)?.code;
    if (isErrorWithCode(e) && code === statusCodes.SIGN_IN_CANCELLED) {
      return { ok: false, reason: 'cancelled' };
    }
    return { ok: false, reason: 'failed', detail: describe(e) };
  }
}

/**
 * 구글 오류를 사람이 옮겨 적을 수 있는 한 줄로.
 *
 * **`String(e)`로는 부족하다.** 구글 쪽 오류는 `code`에 원인이 들어 있는데
 * `String()`은 `message`만 꺼내서, 화면에 찍어도 어느 설정이 틀렸는지 알 수 없다.
 * 2026-09-12에 실제로 그 상태로 막혔다.
 */
function describe(e: unknown): string {
  const o = e as { code?: string | number; message?: string } | null;
  const parts = [o?.code != null ? `code=${o.code}` : null, o?.message ?? null].filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : String(e);
}

export async function signOutFromGoogle() {
  if (!HAS_NATIVE_GOOGLE) return;
  try {
    ensureConfigured();
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { GoogleSignin } = require('@react-native-google-signin/google-signin');
    await GoogleSignin.signOut();
  } catch {
    // 구글 쪽 로그아웃이 실패해도 우리 세션은 지운다. 앱에서 나가는 것이 먼저다
  }
}
