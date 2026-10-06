import { completeUpload, fetchStt, requestUploadSlot } from '@shared/api/audio';
import { uploadFormatFor } from '@shared/audio/format';
import { HAS_API, isApiError } from '@shared/api/client';
import { MAX_BATCH, pullDreams, pushDreams, type DreamPayload, type DreamView } from '@shared/api/sync';
// 배럴(`@shared/audio`)이 아니라 파일을 직접 부른다 — 배럴은 녹음 훅과 네이티브 오디오 모듈을
// 같이 끌고 와서, 동기화가 그것들에 묶일 이유가 없다. `@shared/auth/session`과 같은 이유다
import { fileSize, putFile, uploadBackend } from '@shared/audio/upload';
import { isExpired, loadSession } from '@shared/auth/session';
import { getDreamRepo, nowIso, SETTINGS, toMillisIso, type Dream, type SentVersion } from '@shared/db';
import { decideMerge, mergeTranscript } from '@shared/stt/merge';

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
  /** 받기에서 변환문을 본문에 합친 수 */
  merged: number;
  /** 이번 회차에 서버로 올린 녹음 파일 수 */
  uploaded: number;
  /** 올리지 못한 녹음. 다음 회차에 다시 시도하는 것과 포기한 것이 섞여 있다 — `reason` 으로 가른다 */
  uploadIssues: { id: string; reason: string }[];
  /** 더 올릴 것이 남았는가. 한 번에 100건까지라 여러 번 부를 수 있다 */
  morePending: boolean;
  error: string | null;
};

const EMPTY: SyncReport = {
  pushed: 0,
  skipped: 0,
  rejected: [],
  pulled: 0,
  merged: 0,
  uploaded: 0,
  uploadIssues: [],
  morePending: false,
  error: null,
};

/**
 * 한 회차에 올리는 녹음 파일 수의 상한. 파일 하나가 분당 약 1MB 라 회차가 길어지는 것을 막는다.
 * 남으면 `morePending` 으로 알리고 다음 회차가 이어받는다
 */
const MAX_UPLOADS_PER_ROUND = 3;

/**
 * 한 회차에 살펴보는 후보 수. 상한(3건)보다 훨씬 크게 잡는 이유는 사라진 파일이 앞자리를
 * 차지해도 뒤의 새 녹음까지 닿게 하려는 것이다. 후보가 이만큼 차면 `morePending` 으로 알린다
 */
const MAX_UPLOAD_CANDIDATES = 50;

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
  const report: SyncReport = { ...EMPTY, rejected: [], uploadIssues: [] };

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
        // 녹음 파일이 서버에 있는가 · 변환이 끝났는가는 **행을 덮었는지와 따로** 본다(문서 040 03장).
        // 안 올린 수정이 있어 행을 안 덮었어도 변환은 끝났을 수 있다
        if (v.audioUrl != null) {
          await repo.markAudioUploaded(v.id, nowIso());
          if (v.sttStatus === 'done') report.merged += await mergeIfNeeded(repo, token, v);
        }
      }
      // **한 페이지를 다 반영한 뒤에만 옮기고, 둘을 한 번에 쓴다.** 먼저 옮기고 실패하면
      // 그 사이 변경을 영영 못 받는다. 서버가 nextSince를 안 주면 위치를 건드리지 않는다
      if (!page.nextSince) break;
      position = { since: page.nextSince, cursor: page.nextCursor };
      await repo.setSetting(SETTINGS.syncPosition, JSON.stringify(position));
      guard += 1;
      if (!page.hasMore || guard >= 50) break;
    }

    // 3. 녹음 파일을 올린다 — **행이 서버에 있는 것만**(①이 ② 앞, 문서 039), 회차당 상한까지.
    // 올리기 · 받기 뒤에 두는 이유: 방금 올린 행이 서버에 있어야 하고, 다른 기기가 이미 올린 것을
    // 받기에서 표시한 뒤라야 같은 파일을 두 번 올리지 않는다
    if (uploadBackend() !== 'none') {
      // 후보는 넉넉히 집고 **회차 상한은 실제로 시도한 것만 센다.** 사라진 파일은 자리를 쓰지 않는다 —
      // 가장 오래된 3건만 집었더니 그 셋이 전부 사라진 파일이라 새 녹음이 영영 차례를 못 받았다
      // (2026-09-22 기기, 재현 테스트 H10)
      const candidates = await repo.listAudioPending(MAX_UPLOAD_CANDIDATES);
      let attempted = 0;
      for (const d of candidates) {
        if (attempted >= MAX_UPLOADS_PER_ROUND) {
          report.morePending = true;
          break;
        }
        const outcome = await uploadOne(repo, token, d);
        if (outcome === 'uploaded') {
          report.uploaded += 1;
          attempted += 1;
        } else if (outcome === 'already') {
          // 서버에 이미 있어 표시만 했다. 요청 하나뿐이라 자리를 쓰지 않는다
        } else {
          report.uploadIssues.push({ id: d.id, reason: outcome });
          // 파일이 없는 것은 크기만 재고 끝나 자리를 쓰지 않는다. 그 밖의 실패는 시도한 것이라 센다 —
          // 안 세면 계속 실패하는 파일들이 한 회차에 끝없이 돈다
          if (outcome !== 'file_missing') attempted += 1;
          // 망이 끊겼으면 이번 회차는 여기까지. 나머지는 다음 회차가 이어받는다
          if (outcome === 'network') break;
        }
      }
      if (candidates.length === MAX_UPLOAD_CANDIDATES) report.morePending = true;
    }
  } catch (e) {
    report.error = isApiError(e) ? e.message : '동기화에 실패했습니다';
  }

  return report;
}

/**
 * 서버 변환이 끝난 행의 원문을 받아 로컬 본문에 합친다. 합쳤으면 1.
 *
 * 합칠지는 `decideMerge`(문서 039 C3 · C4)가 정한다. **합치는 기준은 지금 로컬 본문이다** —
 * 받기가 덮었든 안 덮었든 그 위에 얹고, 결과를 기기 시각으로 올린다(`update`가 `updatedAt`을
 * 올려 다음 회차에 나간다). 원문 조회가 실패하면 그냥 둔다 — 로컬 `sttStatus`가 `done`이 아니라
 * 다음 회차에 다시 온다
 */
async function mergeIfNeeded(repo: Repo, token: string, v: DreamView): Promise<number> {
  const local = await repo.get(v.id);
  if (!local) return 0;
  const decision = decideMerge({
    audioUrl: v.audioUrl,
    serverSttStatus: v.sttStatus,
    localSttStatus: local.sttStatus,
    serverText: v.text,
  });
  if (decision === 'skip') return 0;
  if (decision === 'mark-done') {
    // 다른 기기가 이미 합친 본문이다. 다시 합치지 않고 "합쳤음"만 표시한다(C4 완화)
    await repo.setSttStatus(v.id, 'done');
    return 0;
  }
  let transcript: string | null;
  try {
    const stt = await fetchStt(token, v.id);
    transcript = stt.status === 'done' ? stt.text : null;
  } catch {
    return 0;
  }
  if (transcript == null) return 0;
  // 조회하는 동안 사용자가 고쳤을 수 있다 — 다시 읽은 로컬 위에 합친다
  const fresh = await repo.get(v.id);
  if (!fresh) return 0;
  await repo.update(v.id, { text: mergeTranscript(fresh.text, transcript), sttStatus: 'done' });
  return 1;
}

/**
 * 녹음 파일 하나를 올린다(문서 039 ② → ③ → ④). 결과는 `uploaded` · `already`(서버에 이미 있음) ·
 * 그 밖의 문자열(못 올린 이유. `network` 면 회차를 멈춘다).
 *
 * 오류 코드별 처리는 `server/README.md` 의 표를 따른다.
 * - `audio_exists` → 올라간 것으로 본다(녹음은 기록당 한 번)
 * - `dream_not_found` · `recording_unfinished` · `upload_missing` → 표시하지 않고 다음 회차에 ②부터
 * - `audio_too_large` → **표시한다.** 다시 보내도 같고, 매 회차 25MB 를 다시 올리게 둘 수 없다.
 *   원본은 폰에 남는다(절대 규칙 2). `uploadIssues` 에 이유가 남는다
 * - PUT 이 2xx 가 아니면 표시하지 않는다. 403 이면 Content-Type 이 서명과 다른 것이다
 */
async function uploadOne(repo: Repo, token: string, d: Dream): Promise<string> {
  if (!d.audioPath) return 'no_file';
  const isNetwork = (e: unknown) => !isApiError(e) || e.status === 0;

  // **파일이 폰에 없으면 올릴 수 없다.** 표시하지 않고 건너뛴다 — 매 회차 크기만 재는 값싼 확인이고,
  // 이유가 uploadIssues 에 남는다. 2026-09-21 기기에서 옛 녹음(캐시 폴더) 하나가 사라져 있었는데
  // 그걸 network 로 적고 회차를 멈춰 새 녹음까지 못 올렸다(재현 테스트 H9). 업로드 자리를 받기
  // 전에 보는 이유: 없는 파일로 자리를 받으면 서버에 쓰지 않을 key 가 남는다
  if ((await fileSize(d.audioPath)) == null) return 'file_missing';

  let slot;
  try {
    slot = await requestUploadSlot(token, d.id, uploadFormatFor(d.audioPath));
  } catch (e) {
    if (isNetwork(e)) return 'network';
    const code = (e as { code: string }).code;
    if (code === 'audio_exists') {
      await repo.markAudioUploaded(d.id, nowIso());
      return 'already';
    }
    return code;
  }

  let status: number;
  try {
    status = (await putFile(slot.uploadUrl, d.audioPath, slot.headers)).status;
  } catch (e) {
    // **이유를 뭉뚱그리지 않는다.** 파일을 못 읽은 것과 망이 끊긴 것은 원인이 정반대인데
    // 한 단어로 묶으면 기기에서 갈릴 근거가 없다(2026-09-21). 이 파일만 건너뛰고 다음으로 간다
    const detail = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
    return `put_failed · ${detail.slice(0, 160)}`;
  }
  if (status < 200 || status >= 300) return `put_${status}`;

  try {
    await completeUpload(token, d.id, slot.key);
  } catch (e) {
    if (isNetwork(e)) return 'network';
    const code = (e as { code: string }).code;
    if (code === 'audio_too_large') await repo.markAudioUploaded(d.id, nowIso());
    return code;
  }
  await repo.markAudioUploaded(d.id, nowIso());
  return 'uploaded';
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
/**
 * 계정 삭제 동안 동기화를 멈춘다(이슈 #65 · 계약 065 02장). 돌던 회차가 끝나기를 기다린 뒤 돌아오고,
 * 그 뒤로는 다시 켤 때까지 새 회차를 시작하지 않는다 — 삭제와 겹친 올리기가 지운 것을 되살리지 않게.
 * 녹음 올리기도 회차 안에서 돌므로 함께 멈춘다. 돌려준 함수로 다시 켠다
 */
let paused = 0;

export async function pauseSync(): Promise<() => void> {
  paused += 1;
  if (inFlight) await inFlight.catch(() => null);
  let done = false;
  return () => {
    if (done) return;
    done = true;
    paused -= 1;
  };
}

export function syncIfSignedIn(opts: { force?: boolean } = {}): Promise<SyncReport | null> {
  if (paused > 0) return Promise.resolve(null);
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
