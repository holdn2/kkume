import { useCallback, useEffect, useState } from 'react';

import type { Author, CommunityApi } from '@shared/api/community';
import { createHttpCommunity } from '@shared/api/communityHttp';
import { isExpired, loadSession } from '@shared/auth/session';
import { getDreamRepo } from '@shared/db';

import { migrateLocalBlocks } from './logic';

/**
 * 커뮤니티 화면이 쓰는 것의 문 하나. 화면은 `CommunityApi` 인터페이스만 본다.
 *
 * **2026-09-30부터 진짜 서버가 답한다**(서버 이슈 #60 · PR #61). 그 전에 화면을 만들던 가짜 서버
 * (`./fake`)는 규칙 테스트(`scripts/community`)가 계속 쓴다 — 서버 테스트와 이름을 맞춰 둔 기준이다.
 * 만료된 토큰은 넘기지 않는다: 서버는 보낸 토큰이 맞아야 해서 붙이면 읽기까지 401 이 된다(056).
 */
const http = createHttpCommunity({
  token: async () => {
    const s = await loadSession();
    return s && !isExpired(s) ? s.accessToken : null;
  },
});

export function getCommunityApi(): CommunityApi {
  return http;
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
 * 차단 목록. **서버에 둔다**(서버 계약 056 04장 1) — 앱을 지우면 사라지고, 앱에서 거르면 쪽이 비어 온다.
 * 서버가 피드와 글 상세의 댓글을 거르므로 화면은 거르지 않는다. 차단한 사람의 글 상세 · 프로필은
 * 서버도 거르지 않아서(일부러 들어온 경우) 화면이 "차단한 사용자입니다"를 띄우는 데 이 목록을 쓴다.
 *
 * 가짜 서버 기간에 폰(`blocked_users`)에 쌓인 차단은 로그인 뒤 처음 읽을 때 서버로 옮긴다 —
 * 전부 올렸을 때만 폰에서 비운다(`migrateLocalBlocks`). 로그인하지 않았으면 차단이 없다.
 */
export type Blocked = Author[];

async function readBlocked(): Promise<Blocked> {
  const session = await loadSession();
  if (!session || isExpired(session)) return [];
  const api = getCommunityApi();
  const repo = await getDreamRepo();
  await migrateLocalBlocks(api, {
    get: (k) => repo.getSetting(k),
    set: (k, v) => repo.setSetting(k, v),
  }).catch(() => {});
  return api.blocks();
}

export async function setBlocked(user: Author, blocked: boolean): Promise<void> {
  const api = getCommunityApi();
  if (blocked) await api.block(user.id);
  else await api.unblock(user.id);
}

export function useBlocked() {
  const [list, setList] = useState<Blocked>([]);
  const reload = useCallback(() => {
    void readBlocked()
      .then(setList)
      .catch(() => {});
  }, []);
  useEffect(reload, [reload]);
  const ids = new Set(list.map((u) => u.id));
  return { list, ids, reload };
}

export { mergePage, shareDream } from './logic';
export { ago, REPORT_REASONS } from './format';
