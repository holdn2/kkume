import Constants from 'expo-constants';

/**
 * 서버로 나가는 유일한 통로.
 *
 * **주소를 `EXPO_PUBLIC_*`로 두지 않았다.** 그건 번들을 만들 때 인라인되는데,
 * `eas update`는 번들을 로컬에서 만들기 때문에 셸에 값이 없으면 조용히 비어서 나간다 —
 * `EXPO_PUBLIC_STORYBOOK_ENABLED`로 이미 한 번 겪었다(`CLAUDE.md` 빌드 예산).
 * `app.json`의 `extra`는 설정과 함께 따라가므로 그 함정이 없다.
 */
const BASE_URL: string = (Constants.expoConfig?.extra as { apiBaseUrl?: string } | undefined)
  ?.apiBaseUrl ?? '';

export const HAS_API = BASE_URL.length > 0;

/** 진단 화면이 그대로 찍는다. 비밀이 아니라 앱에 박혀 있는 값이다 */
export const API_BASE_URL = BASE_URL;

/**
 * 서버에 닿는지만 본다. **로그인 흐름과 분리해서 재는 것이 목적이다.**
 *
 * 로그인은 구글 → 토큰 → 서버로 이어져서 어디서 끊겼는지 가리기 어렵다.
 * 이건 `fetch` 한 번이라 실패하면 원인이 네트워크 하나로 좁혀진다.
 * 결과를 던지지 않고 문자열로 돌려준다 — 화면에 그대로 찍으려고.
 */
export async function ping(): Promise<string> {
  if (!HAS_API) return '서버 주소가 없습니다';
  const started = Date.now();
  try {
    const res = await fetch(`${BASE_URL}/health`);
    const text = await res.text();
    return `HTTP ${res.status} · ${Date.now() - started}ms\n${text.slice(0, 160)}`;
  } catch (e) {
    const detail = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
    return `실패 · ${Date.now() - started}ms\n${detail}`;
  }
}

export type ApiError = {
  /** 서버가 주는 기계용 코드. 화면에 그대로 쓰지 않는다 */
  code: string;
  /** 서버가 주는 사람용 문구. 이미 존댓말이라 그대로 보여줘도 된다 */
  message: string;
  status: number;
};

export function isApiError(e: unknown): e is ApiError {
  return typeof e === 'object' && e !== null && 'code' in e && 'status' in e;
}

/** 네트워크가 느려도 새벽 화면을 붙잡지 않는다. 기록은 서버를 기다리지 않는다 */
const TIMEOUT_MS = 15_000;

export async function request<T>(
  path: string,
  init: { method?: string; body?: unknown; token?: string | null } = {},
): Promise<T> {
  if (!HAS_API) {
    throw { code: 'no_base_url', message: '서버 주소가 설정되지 않았습니다', status: 0 } as ApiError;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      method: init.method ?? 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(init.token ? { Authorization: `Bearer ${init.token}` } : {}),
      },
      body: init.body == null ? undefined : JSON.stringify(init.body),
      signal: controller.signal,
    });

    if (!res.ok) {
      // 서버는 { code, message } 를 준다. 형식이 아닌 응답(프록시 오류 · HTML 에러 페이지)도
      // 오므로 파싱 실패를 따로 받는다 — 여기서 던지면 원인이 통째로 가려진다
      let body: { code?: string; message?: string } = {};
      try {
        body = (await res.json()) as typeof body;
      } catch {
        /* 형식이 아닌 응답. 아래에서 status로만 말한다 */
      }
      throw {
        code: body.code ?? 'http_error',
        message: body.message ?? '서버와 통신하지 못했습니다',
        status: res.status,
      } as ApiError;
    }

    // 204처럼 본문이 없는 응답이 있다. text로 받아 비어 있으면 undefined로 돌려준다
    const text = await res.text();
    try {
      return (text ? JSON.parse(text) : undefined) as T;
    } catch {
      // **파싱 실패를 네트워크 실패와 섞지 않는다.** 아래 catch로 흘려보내면
      // "네트워크에 연결할 수 없습니다"가 뜨는데, 실제로는 서버에 닿았고
      // 응답이 JSON이 아닌 것이다. 원인이 정반대라 한 문구로 묶으면 안 된다
      throw {
        code: 'bad_response',
        message: `서버 응답을 읽지 못했습니다\n${text.slice(0, 120)}`,
        status: res.status,
      } as ApiError;
    }
  } catch (e) {
    if (isApiError(e)) throw e;
    const aborted = e instanceof Error && e.name === 'AbortError';
    // **원래 오류를 함께 남긴다.** 2026-09-13에 여기서 막혔는데 문구가
    // "네트워크에 연결할 수 없습니다" 하나뿐이라, ATS인지 주소인지 TLS인지
    // 구분할 근거가 없었다. RN의 fetch는 이유를 message에 담아 준다
    const detail = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
    throw {
      code: aborted ? 'timeout' : 'network',
      message: `${aborted ? '서버 응답이 없습니다' : '네트워크에 연결할 수 없습니다'}\n${detail}`,
      status: 0,
    } as ApiError;
  } finally {
    clearTimeout(timer);
  }
}
