import { HAS_API, isApiError } from '@shared/api/client';
import { MAX_BATCH, pullDreams, pushDreams, type DreamPayload, type DreamView } from '@shared/api/sync';
import { isExpired, loadSession } from '@shared/auth/session';
import { getDreamRepo, SETTINGS, toMillisIso, type Dream, type SentVersion } from '@shared/db';

/**
 * 동기화는 **올리고 나서 받는다.**
 *
 * 순서를 바꾸면 방금 만든 로컬 기록이 서버의 옛 상태로 덮인다 —
 * 받는 쪽이 `upsertFromServer`라 로컬 변경을 알지 못한다.
 * 먼저 올려 두면 서버가 최신을 들고 있으므로 되받아도 잃는 것이 없다.
 *
 * **기록을 막지 않는다.** 실패해도 로컬에는 이미 다 있고(절대 규칙 1),
 * 다음 기회에 다시 올린다. 그래서 이 함수는 던지지 않고 요약을 돌려준다.
 */
export type SyncReport = {
  pushed: number;
  skipped: number;
  rejected: { id: string; reason: string | null }[];
  pulled: number;
  /** 더 올릴 것이 남았는가. 한 번에 100건까지라 여러 번 부를 수 있다 */
  morePending: boolean;
  error: string | null;
};

const EMPTY: SyncReport = {
  pushed: 0,
  skipped: 0,
  rejected: [],
  pulled: 0,
  morePending: false,
  error: null,
};

function toPayload(d: Dream): DreamPayload {
  return {
    id: d.id,
    recordedAt: d.recordedAt,
    title: d.title,
    text: d.text,
    durationMs: d.durationMs,
    reviewedAt: d.reviewedAt,
    deletedAt: d.deletedAt,
    updatedAt: d.updatedAt,
  };
}

type PullPosition = { since: string | null; cursor: string | null };

type Repo = Awaited<ReturnType<typeof getDreamRepo>>;

/**
 * 저장해 둔 받기 위치. 없거나 깨졌으면 처음부터 받는다 —
 * 이미 있는 행은 `upsertFromServer`가 그대로 흡수하므로, 다시 받는 것은 유실보다 낫다
 */
async function readPosition(repo: Repo): Promise<PullPosition> {
  const raw = await repo.getSetting(SETTINGS.syncPosition);
  if (!raw) return { since: null, cursor: null };
  try {
    const p = JSON.parse(raw) as Partial<PullPosition>;
    return {
      since: typeof p.since === 'string' ? p.since : null,
      cursor: typeof p.cursor === 'string' ? p.cursor : null,
    };
  } catch {
    return { since: null, cursor: null };
  }
}

/**
 * 한 번 돈다. 여러 번 돌려야 할 수도 있어서 `morePending`을 함께 돌려준다 —
 * **여기서 while로 돌지 않는다.** 새벽에 화면을 잡고 있을 수 있고,
 * 서버가 계속 거절하면 무한히 돈다.
 */
export async function syncOnce(token: string): Promise<SyncReport> {
  const repo = await getDreamRepo();
  const report: SyncReport = { ...EMPTY, rejected: [] };

  try {
    // 1. 올린다
    const pending = await repo.listUnsynced(MAX_BATCH);
    if (pending.length > 0) {
      const { results } = await pushDreams(token, pending.map(toPayload));
      // **보낸 버전을 기억해 둔다.** 표시할 때 "지금 로컬"이 아니라 "보낸 그 버전"과
      // 대조해야 요청이 떠 있는 동안 고친 것을 놓치지 않는다(재현 테스트 A)
      const sentAt = new Map(pending.map((d) => [d.id, d.updatedAt]));
      const ok: SentVersion[] = [];
      for (const r of results) {
        const updatedAt = sentAt.get(r.id);
        if (r.status === 'saved' && updatedAt) {
          ok.push({ id: r.id, updatedAt });
          report.pushed += 1;
        } else if (r.status === 'skipped' && updatedAt) {
          // 서버 쪽이 더 최신이라 안 받았다. **이것도 동기화된 것으로 표시한다** —
          // 안 하면 같은 건을 영원히 다시 보내고, 아래 pull이 최신을 가져온다
          ok.push({ id: r.id, updatedAt });
          report.skipped += 1;
        } else {
          // 거절은 표시하지 않는다. 표시하면 고칠 기회 없이 조용히 묻힌다
          report.rejected.push({ id: r.id, reason: r.reason });
        }
      }
      await repo.markSynced(ok);
      report.morePending = pending.length === MAX_BATCH;
    }

    // 2. 받는다
    // **since와 cursor는 짝으로 움직인다.** 서버는 (updatedAt > since) 또는
    // (updatedAt = since 이고 id > cursor)로 이어 준다. cursor만 넘기고 since를 그대로 두면
    // 첫 페이지가 다시 오고(재현 테스트 E), cursor를 남기지 않으면 같은 시각의 행 사이에서
    // 회차가 끊겼을 때 나머지를 못 받는다(D)
    let position = await readPosition(repo);
    let guard = 0;
    // 페이지가 이어지면 따라간다. 서버가 hasMore를 잘못 주는 경우를 대비해
    // 상한을 둔다 — 없으면 여기서 앱이 멈춘다. 위치를 저장하므로 끊겨도 다음 회차가 이어받는다
    for (;;) {
      const page = await pullDreams(token, { since: position.since, cursor: position.cursor });
      for (const v of page.dreams) {
        await repo.upsertFromServer({
          id: v.id,
          recordedAt: v.recordedAt,
          title: v.title,
          text: v.text,
          durationMs: v.durationMs,
          reviewedAt: v.reviewedAt,
          deletedAt: v.deletedAt,
          createdAt: v.createdAt,
          // `v.updatedAt`(서버 시계)이 아니라 그 버전을 만든 기기의 시각이다.
          // 서버 시계를 넣으면 기기 시계와 섞여 같은 기록이 매 회차 오간다(재현 테스트 C)
          clientUpdatedAt: v.clientUpdatedAt,
        });
        report.pulled += 1;
      }
      // **한 페이지를 다 반영한 뒤에만 옮기고, 둘을 한 번에 쓴다.** 먼저 옮기고 실패하면
      // 그 사이 변경을 영영 못 받는다. 서버가 nextSince를 안 주면 위치를 건드리지 않는다
      if (!page.nextSince) break;
      position = { since: page.nextSince, cursor: page.nextCursor };
      await repo.setSetting(SETTINGS.syncPosition, JSON.stringify(position));
      guard += 1;
      if (!page.hasMore || guard >= 50) break;
    }
  } catch (e) {
    report.error = isApiError(e) ? e.message : '동기화에 실패했습니다';
  }

  return report;
}

/** 목록 탭을 오갈 때마다 서버를 두드리지 않는다 */
const MIN_INTERVAL_MS = 30_000;

let lastRunAt = 0;
let inFlight: Promise<SyncReport | null> | null = null;

/**
 * 로그인돼 있으면 한 번 돈다. 아니면 조용히 `null`을 돌려준다.
 *
 * **화면이 부르는 것은 이것이다.** 토큰을 화면이 들고 다니지 않게 여기서 꺼낸다.
 *
 * 두 가지를 막는다.
 * - **겹침** — 목록 포커스와 로그인 직후가 동시에 부르면 같은 기록을 두 번 올린다.
 *   진행 중인 것이 있으면 그 약속을 그대로 돌려준다
 * - **잦은 호출** — 탭을 오갈 때마다 부르면 무료 플랜 서버(t3.micro)에 부담이다.
 *   `force`가 아니면 30초 안에 다시 돌지 않는다
 */
export function syncIfSignedIn(opts: { force?: boolean } = {}): Promise<SyncReport | null> {
  if (inFlight) return inFlight;
  if (!HAS_API) return Promise.resolve(null);
  if (!opts.force && Date.now() - lastRunAt < MIN_INTERVAL_MS) return Promise.resolve(null);

  inFlight = (async () => {
    try {
      const s = await loadSession();
      // 로그인 안 했거나 만료됐으면 부르지 않는다. 401만 받고 끝난다
      if (!s || isExpired(s)) return null;
      lastRunAt = Date.now();
      return await syncOnce(s.accessToken);
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

export type SyncDiagnosis = {
  /** 돌리지 못했거나 서버를 세지 못한 이유 */
  note: string | null;
  report: SyncReport | null;
  local: { count: number; pending: number } | null;
  server: {
    count: number;
    deleted: number;
    latest: { title: string | null } | null;
    truncated: boolean;
  } | null;
};

/** 서버를 세다 멈추는 페이지 수. 100건씩이라 2,000건이다 */
const DIAG_MAX_PAGES = 20;

/**
 * 진단 화면의 「동기화 확인」. **기기에서 동기화가 실제로 돌았는지 눈으로 보려고 둔다** —
 * 평소 동기화는 조용히 돌아서 결과가 화면 어디에도 안 남는다.
 *
 * 한 번 돌린 뒤 서버를 처음부터 훑어 개수를 센다. **받기만 하고 로컬에 쓰지 않으며
 * 받기 위치도 건드리지 않는다** — 올린 것이 서버에 들어갔는지를 동기화 경로와 따로 본다.
 * 같은 경로로 확인하면 그 경로의 실수를 그대로 믿게 된다.
 */
export async function diagnoseSync(): Promise<SyncDiagnosis> {
  const none = { report: null, local: null, server: null };
  if (!HAS_API) return { ...none, note: '서버 주소가 없습니다' };
  const s = await loadSession();
  if (!s || isExpired(s)) return { ...none, note: '로그인이 필요합니다' };

  const report = await syncIfSignedIn({ force: true });
  const repo = await getDreamRepo();
  const local = {
    count: (await repo.list()).length,
    pending: (await repo.listUnsynced(1000)).length,
  };

  let count = 0;
  let deleted = 0;
  let latest: DreamView | null = null;
  let since: string | null = null;
  let cursor: string | null = null;
  let truncated = false;
  try {
    for (let page = 0; ; page += 1) {
      if (page >= DIAG_MAX_PAGES) {
        truncated = true;
        break;
      }
      const res = await pullDreams(s.accessToken, { since, cursor });
      for (const v of res.dreams) {
        if (v.deletedAt) {
          deleted += 1;
          continue;
        }
        count += 1;
        if (!latest || toMillisIso(v.clientUpdatedAt) > toMillisIso(latest.clientUpdatedAt)) latest = v;
      }
      if (!res.hasMore || !res.nextSince) break;
      since = res.nextSince;
      cursor = res.nextCursor;
    }
  } catch (e) {
    return { note: isApiError(e) ? e.message : '서버 기록을 세지 못했습니다', report, local, server: null };
  }

  return {
    note: null,
    report,
    local,
    server: { count, deleted, latest: latest ? { title: latest.title } : null, truncated },
  };
}

/**
 * 로그아웃할 때 부른다. 받기 위치(`sync_position`)를 지운다.
 *
 * 안 지우면 **다음에 로그인한 계정이 앞 계정의 위치를 물려받아**, 그 계정이 예전에 남긴
 * 서버 기록을 영영 못 받는다 — `since`를 이미 지나 있기 때문이다(재현 테스트 G).
 * 지우면 처음부터 다시 받고, 이미 있는 행은 `upsertFromServer`가 흡수한다.
 *
 * **로그아웃 중에 남긴 기록이 다음 계정으로 올라가는 것은 막지 않는다**(재현 테스트 G2, 문서 038).
 * 기록에 주인을 적어야 풀리는 문제라 커뮤니티(7~8주차) 때 함께 본다.
 *
 * 돌던 동기화가 있으면 끝나길 기다린다 — 그 동기화가 끝나면서 위치를 다시 써,
 * 방금 지운 것이 되살아나지 않게
 */
export async function resetSyncPosition(): Promise<void> {
  if (inFlight) await inFlight.catch(() => null);
  const repo = await getDreamRepo();
  await repo.setSetting(SETTINGS.syncPosition, '');
}
