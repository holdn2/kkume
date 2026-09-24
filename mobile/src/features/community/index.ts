import { useCallback, useEffect, useState } from 'react';

import type { Author, CommunityApi } from '@shared/api/community';
import { loadSession } from '@shared/auth/session';
import { getDreamRepo, SETTINGS } from '@shared/db';

import { fakeCommunity } from './fake';

/**
 * 커뮤니티 화면이 쓰는 것의 문 하나.
 *
 * **지금은 가짜 서버가 답한다.** 서버에 커뮤니티 API 가 생기면 `getCommunityApi` 가 돌려주는
 * 것만 바꾼다 — 화면은 `CommunityApi` 인터페이스만 보고 있어서 그대로다.
 */
export function getCommunityApi(): CommunityApi {
  return fakeCommunity;
}

/** 지금 로그인한 사람. 로그인 전이면 null — 읽기는 되고 쓰기는 로그인을 부탁한다 */
export function useMe(): Author | null | undefined {
  const [me, setMe] = useState<Author | null | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    void loadSession().then((s) => {
      if (alive) setMe(s ? { id: s.user.id, nickname: s.user.nickname } : null);
    });
    return () => {
      alive = false;
    };
  }, []);
  return me;
}

/**
 * 차단 목록. **앱에서 거른다**(계획서 001 — 차단한 사람의 글 · 댓글을 내 피드에서 숨긴다).
 *
 * 로컬 설정에 둔다. 새 저장소를 들이지 않으려고 꿈 기록과 같은 SQLite 설정 표를 쓴다.
 * 기기를 바꾸면 따라오지 않는다 — 서버에 둘지는 계약 요청 문서에서 묻는다.
 */
export type Blocked = Author[];

async function readBlocked(): Promise<Blocked> {
  const raw = await (await getDreamRepo()).getSetting(SETTINGS.blockedUsers);
  if (!raw) return [];
  try {
    const list = JSON.parse(raw) as Blocked;
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export async function setBlocked(user: Author, blocked: boolean): Promise<Blocked> {
  const now = await readBlocked();
  const next = blocked ? [...now.filter((u) => u.id !== user.id), user] : now.filter((u) => u.id !== user.id);
  await (await getDreamRepo()).setSetting(SETTINGS.blockedUsers, JSON.stringify(next));
  return next;
}

export function useBlocked() {
  const [list, setList] = useState<Blocked>([]);
  const reload = useCallback(() => {
    void readBlocked().then(setList);
  }, []);
  useEffect(reload, [reload]);
  const ids = new Set(list.map((u) => u.id));
  return { list, ids, reload };
}

export { ago, REPORT_REASONS } from './format';
