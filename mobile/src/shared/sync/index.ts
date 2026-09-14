import { HAS_API, isApiError } from '@shared/api/client';
import { MAX_BATCH, pullDreams, pushDreams, type DreamPayload } from '@shared/api/sync';
import { isExpired, loadSession } from '@shared/auth/session';
import { getDreamRepo, SETTINGS, type Dream, type SentVersion } from '@shared/db';

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
    const since = await repo.getSetting(SETTINGS.syncSince);
    let cursor: string | null = null;
    let guard = 0;
    // 페이지가 이어지면 따라간다. 서버가 hasMore를 잘못 주는 경우를 대비해
    // 상한을 둔다 — 없으면 여기서 앱이 멈춘다
    for (;;) {
      const page = await pullDreams(token, { since, cursor });
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
      // **한 페이지를 다 반영한 뒤에만 옮긴다.** 먼저 옮기고 실패하면
      // 그 사이 변경을 영영 못 받는다
      if (page.nextSince) await repo.setSetting(SETTINGS.syncSince, page.nextSince);
      cursor = page.nextCursor;
      guard += 1;
      if (!page.hasMore || !cursor || guard >= 50) break;
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
