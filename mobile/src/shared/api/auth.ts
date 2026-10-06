import { request } from './client';

/**
 * 서버의 `AuthController`와 1:1로 맞춘 계약이다.
 * 이름을 마음대로 바꾸지 않는다 — 어긋나면 401만 보고 원인을 못 찾는다.
 */
export type LoginResponse = {
  accessToken: string;
  /** 초 단위. 서버의 `AppTokenService.ttl`에서 온다 */
  expiresIn: number;
  user: { id: string; nickname: string };
};

/**
 * 구글 ID 토큰을 서버에 맡겨 우리 세션 토큰으로 바꾼다.
 *
 * **클라이언트가 신원을 정하지 않는다.** 서버가 구글 공개키로 서명을 검증하고
 * `iss`·`aud`까지 본 뒤에야 사용자를 확정한다. 앱이 "나 이 사람이야"라고 하는 것을
 * 믿으면 누구나 남의 계정으로 들어온다.
 *
 * **401은 이유를 알려주지 않는다.** 서버가 일부러 그렇게 했다 —
 * "서명이 틀렸다"와 "대상이 틀렸다"를 구분해 주면 토큰을 맞춰 보는 쪽에 힌트가 된다.
 * 그래서 로그인이 안 될 때는 앱 로그가 아니라 **서버 로그**를 봐야 한다.
 */
export function loginWithGoogle(idToken: string) {
  return request<LoginResponse>('/api/auth/google', {
    method: 'POST',
    body: { idToken },
  });
}

export type Me = { id: string; nickname: string };

export function fetchMe(token: string) {
  return request<Me>('/api/me', { token });
}

/**
 * 계정 삭제(서버 계약 064 · 066). `204`면 서버가 그 자리에서 다 지웠다 — 유예 없음.
 * `401 account_deleted`(이미 지움)도 성공이다. 해석은 `@shared/auth/deletion`이 한다
 */
export function deleteMe(token: string) {
  return request<void>('/api/me', { method: 'DELETE', token });
}
