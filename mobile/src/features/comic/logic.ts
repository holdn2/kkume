import { isApiError } from '@shared/api/client';
import type { ComicGender, ComicStatus } from '@shared/api/comic';

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
 * 그림 주소에서 서명(`?X-Amz-…`)을 뺀 것 — **같은 그림이면 같다.** 서버는 응답할 때마다 새로 서명한 주소를 줘서
 * 주소 문자열로는 같은 그림인지 알 수 없다(이슈 #129). 컷의 「받았다」 표시와 이미지 캐시 키로 쓴다
 */
export function imageKey(url: string): string {
  const q = url.indexOf('?');
  return q < 0 ? url : url.slice(0, q);
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

/**
 * 말풍선을 둘 위쪽 모서리. 서버가 준 `speaker` 를 믿되, 없거나 모르는 값이면 컷 순서로 왼쪽 · 오른쪽을 번갈아 둔다.
 * 서버는 아직 `speaker` 를 보내지 않는다 — 늘 위 가운데에 떠 있던 것이 어색했다(문서 103 B4, 이슈 #161).
 * 모서리에 두고 꼬리를 그림 가운데로 향하게 하면 얼굴을 덜 가리고 누구를 가리켜도 크게 틀리지 않는다
 */
export type BubbleSide = 'left' | 'right';

export function bubbleSide(speaker: unknown, index: number): BubbleSide {
  if (speaker === 'left' || speaker === 'right') return speaker;
  return index % 2 === 0 ? 'left' : 'right';
}

/** 만화 주인공 고르기(이슈 #117). 빈 값은 정하지 않음 — 꿈에 맡긴다 */
export const GENDER_OPTIONS: { value: ComicGender | ''; label: string }[] = [
  { value: '', label: '정하지 않음' },
  { value: 'female', label: '여성' },
  { value: 'male', label: '남성' },
];

/** 설정에 저장된 값을 읽는다. 모르는 값 · 빈 값은 정하지 않음(null) */
export function parseGender(stored: string | null | undefined): ComicGender | null {
  return stored === 'female' || stored === 'male' ? stored : null;
}

export function genderLabel(gender: ComicGender | null): string {
  return GENDER_OPTIONS.find((o) => o.value === (gender ?? ''))?.label ?? '정하지 않음';
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
  return { kind: 'message', message: '만화를 만들지 못했어요. 잠시 뒤 다시 시도해 주세요.' };
}
