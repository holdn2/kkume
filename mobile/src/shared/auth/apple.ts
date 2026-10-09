import { requireOptionalNativeModule } from 'expo-modules-core';
import { Platform } from 'react-native';

/**
 * 애플 로그인 어댑터(이슈 #72, 문서 075).
 *
 * **빌드가 필요 없다.** `expo-apple-authentication` 플러그인이 #34 때부터 `app.json`에 있었고, 이 플러그인은
 * Sign in with Apple entitlement를 조건 없이 넣는다. 설치된 빌드 `c3d74d94`의 IPA에서 서명된 권한과
 * 네이티브 모듈을 모두 확인했다(2026-10-09). 그래도 모듈은 먼저 물어보고 쓴다(절대 규칙 10)
 */
export const HAS_NATIVE_APPLE = Platform.OS === 'ios' && requireOptionalNativeModule('ExpoAppleAuthentication') != null;

/** 이 기기에서 애플 로그인을 띄울 수 있는가. 안드로이드 · 모듈 없는 빌드는 false */
export async function appleAvailable(): Promise<boolean> {
  if (!HAS_NATIVE_APPLE) return false;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { isAvailableAsync } = require('expo-apple-authentication');
    return await isAvailableAsync();
  } catch {
    return false;
  }
}

export type AppleResult =
  | { ok: true; identityToken: string; authorizationCode: string | null }
  | { ok: false; reason: 'cancelled' | 'unavailable' | 'failed'; detail?: string };

/**
 * 애플 로그인 시트를 띄우고 **ID 토큰까지만** 받아 온다. 그 뒤는 서버 몫이다(구글과 같다).
 *
 * **이름 · 이메일을 요청하지 않는다**(`requestedScopes: []`). 꿈은 사적인 내용이라 실명이 딸려 오는 것을 피하고,
 * 서버도 `sub`만 쓴다(문서 075 01장). `authorizationCode`는 계정 삭제 때 애플 토큰을 회수하는 데 쓴다(075 02장)
 */
export async function signInWithApple(): Promise<AppleResult> {
  if (!HAS_NATIVE_APPLE) return { ok: false, reason: 'unavailable' };
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { signInAsync } = require('expo-apple-authentication');
    const cred = await signInAsync({ requestedScopes: [] });
    if (!cred?.identityToken) return { ok: false, reason: 'failed', detail: 'identityToken이 비어 있습니다' };
    return { ok: true, identityToken: cred.identityToken, authorizationCode: cred.authorizationCode ?? null };
  } catch (e) {
    const o = e as { code?: string; message?: string } | null;
    // 사용자가 스스로 닫은 것은 실패가 아니다
    if (o?.code === 'ERR_REQUEST_CANCELED') return { ok: false, reason: 'cancelled' };
    const detail = [o?.code ? `code=${o.code}` : null, o?.message ?? null].filter(Boolean).join(' · ');
    return { ok: false, reason: 'failed', detail: detail || String(e) };
  }
}
