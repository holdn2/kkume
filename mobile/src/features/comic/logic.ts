import { isApiError } from '@shared/api/client';
import type { ComicStatus } from '@shared/api/comic';

/**
 * CM-2 체크리스트(계획서 003 — "막연한 스피너가 아니라 3단계 체크리스트").
 * 서버 상태 셋을 그대로 보여 준다: 시나리오 → 그림 → 마무리.
 */
export type StepState = 'waiting' | 'active' | 'done';

export const COMIC_STEPS = ['이야기를 네 컷으로 나누는 중', '그림을 그리는 중', '말풍선을 얹는 중'] as const;

export function stepStates(status: ComicStatus): StepState[] {
  switch (status) {
    case 'queued':
      return ['waiting', 'waiting', 'waiting'];
    case 'scripting':
      return ['active', 'waiting', 'waiting'];
    case 'drawing':
      return ['done', 'active', 'waiting'];
    case 'done':
      return ['done', 'done', 'done'];
    // 실패는 어디서 멈췄는지보다 문구가 중요하다 — 체크리스트 대신 문구를 보인다
    case 'failed':
    case 'refused':
      return ['waiting', 'waiting', 'waiting'];
  }
}

/**
 * 2×2 한 장에서 i번째 컷을 잘라 보이는 위치. 그림을 칸의 두 배 크기로 놓고 옮긴다 —
 * 컷 순서는 만화 읽는 순서(왼쪽 위 → 오른쪽 위 → 왼쪽 아래 → 오른쪽 아래)다
 */
export function gridCrop(index: number, cell: number): { width: number; height: number; left: number; top: number } {
  const col = index % 2;
  const row = Math.floor(index / 2);
  return { width: cell * 2, height: cell * 2, left: -col * cell, top: -row * cell };
}

/** 만들기 요청이 실패했을 때 화면이 할 일. 서버 문구는 이미 존댓말이라 그대로 쓴다 */
export type CreateFailure =
  | { kind: 'inProgress'; comicId: string; message: string }
  | { kind: 'login'; message: string }
  | { kind: 'message'; message: string };

export function explainCreateError(e: unknown): CreateFailure {
  if (isApiError(e)) {
    if (e.code === 'comic_in_progress' && typeof e.data?.comicId === 'string') {
      return { kind: 'inProgress', comicId: e.data.comicId, message: e.message };
    }
    if (e.status === 401) return { kind: 'login', message: '마이 탭에서 로그인한 뒤 만들 수 있어요.' };
    if (e.message) return { kind: 'message', message: e.message };
  }
  return { kind: 'message', message: '만화를 만들지 못했습니다. 잠시 뒤 다시 시도해 주세요.' };
}
