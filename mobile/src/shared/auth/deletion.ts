import { isApiError } from '@shared/api/client';

/**
 * 계정 삭제의 흐름(이슈 #65 · 서버 계약 064 + 066 · 모바일 검토 065 04장).
 *
 * 네이티브 · 화면 없이 `scripts/account-deletion`이 돌릴 수 있게 하는 일은 전부 받아서 쓴다.
 *
 * 1. **이 기기의 동기화 · 녹음 올리기를 멈추고, 돌던 회차가 끝나기를 기다린다** — 삭제와 겹친 올리기가
 *    지운 것을 되살리는 길을 이 기기 쪽에서 막는다(065 02장. 다른 기기는 서버가 막는다, 066)
 * 2. `DELETE /api/me`
 * 3. `204` 와 `401 account_deleted`는 **같은 성공**이다 — 응답 전에 끊겨 다시 누르면 이미 지워져 있다(064 02장)
 * 4. 성공이면 이 기기의 계정 흔적을 지운다(`forget`). **폰의 기록은 남긴다**(2026-10-05 사용자 결정)
 * 5. `401 unauthorized`는 다시 로그인하라고, 그 밖(`503 deletion_failed` · 연결 실패)은 문구만 — 세션은 그대로다
 */
export type DeletionResult =
  | { result: 'deleted' }
  | { result: 'relogin'; message: string }
  | { result: 'failed'; message: string };

export type DeletionDeps = {
  /** 동기화를 멈추고 돌던 회차를 기다린다. 다시 켜는 함수를 돌려준다 */
  pauseSync: () => Promise<() => void>;
  callDelete: () => Promise<void>;
  /** 세션 · 받기 위치 · "올렸음" 표시 · 캐시를 지운다 */
  forget: () => Promise<void>;
};

export async function deleteAccount(deps: DeletionDeps): Promise<DeletionResult> {
  const resume = await deps.pauseSync();
  try {
    try {
      await deps.callDelete();
    } catch (e) {
      const code = isApiError(e) ? e.code : null;
      if (code !== 'account_deleted') {
        if (code === 'unauthorized') {
          return { result: 'relogin', message: '로그인이 만료됐습니다. 다시 로그인한 뒤 삭제해 주세요.' };
        }
        const message = isApiError(e) && e.message ? e.message : '계정을 삭제하지 못했습니다. 잠시 뒤 다시 시도해 주세요.';
        return { result: 'failed', message };
      }
    }
    await deps.forget();
    return { result: 'deleted' };
  } finally {
    // 세션이 지워졌으면 동기화는 켜져도 돌지 않는다. 실패했으면 원래대로 돈다
    resume();
  }
}

/**
 * 돌고 있는 동안 다시 불리면 같은 약속을 돌려준다 — 여러 요청이 한꺼번에 `account_deleted`를 받아도
 * 정리는 한 번만 돈다(동기화 · 피드 · 차단 목록이 동시에 나가는 일이 흔하다)
 */
export function onceAtATime(run: () => Promise<void>): () => Promise<void> {
  let current: Promise<void> | null = null;
  return () => {
    if (!current) {
      current = run().finally(() => {
        current = null;
      });
    }
    return current;
  };
}
