import { isApiError } from '@shared/api/client';
import { MAX_BATCH, pullDreams, pushDreams, type DreamPayload } from '@shared/api/sync';
import { getDreamRepo, SETTINGS, type Dream } from '@shared/db';

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
      const ok: string[] = [];
      for (const r of results) {
        if (r.status === 'saved') {
          ok.push(r.id);
          report.pushed += 1;
        } else if (r.status === 'skipped') {
          // 서버 쪽이 더 최신이라 안 받았다. **이것도 동기화된 것으로 표시한다** —
          // 안 하면 같은 건을 영원히 다시 보내고, 아래 pull이 최신을 가져온다
          ok.push(r.id);
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
          updatedAt: v.updatedAt,
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
