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
    return (text ? JSON.parse(text) : undefined) as T;
  } catch (e) {
    if (isApiError(e)) throw e;
    // AbortError와 네트워크 실패를 같은 모양으로 맞춰 준다.
    // 부르는 쪽이 두 가지 실패 형태를 따로 다루지 않아도 되게
    const aborted = e instanceof Error && e.name === 'AbortError';
    throw {
      code: aborted ? 'timeout' : 'network',
      message: aborted ? '서버 응답이 없습니다' : '네트워크에 연결할 수 없습니다',
      status: 0,
    } as ApiError;
  } finally {
    clearTimeout(timer);
  }
}
