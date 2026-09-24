import { completeUpload, fetchStt, requestUploadSlot } from '@shared/api/audio';
import { isApiError } from '@shared/api/client';
import { pullDreams } from '@shared/api/sync';
import { isExpired, loadSession } from '@shared/auth/session';
import { getDreamRepo } from '@shared/db';
import { syncIfSignedIn } from '@shared/sync';

import { fileSize, putFile, uploadBackend } from './upload';

/**
 * 진단 화면의 「오디오 업로드 확인」.
 *
 * **서버가 못 본 한 곳을 기기에서 본다**(문서 042 02장) — 앱이 받은 presigned URL 로
 * 실제 m4a 를 iOS 에서 PUT 하는 것. 서버 쪽은 EC2 안에서 올리기까지 확인했지만
 * 이 구간만은 기기에서 처음 일어난다.
 *
 * 단계마다 한 줄씩 남기고 **막힌 자리에서 멈춘다.** 막히면 응답 전문과 UTC 시각을 붙인다 —
 * 서버가 그 둘을 달라고 했다. 서명 값은 가린다.
 *
 * **폰의 원본은 건드리지 않는다**(절대 규칙 2). 로컬에 쓰는 것도 없다 —
 * 받기는 개수와 `audioUrl` 을 보려고만 부르고 저장하지 않는다.
 */
export type ProbeResult = { ok: boolean; lines: string[] };

const utc = () => new Date().toISOString();

/** 서명이 붙은 질의는 통째로 가린다. 화면 캡처가 그대로 문서에 들어갈 수 있다 */
const maskUrl = (url: string) => `${url.split('?')[0]}?(서명 가림)`;

function describe(e: unknown): string {
  if (isApiError(e)) return `HTTP ${e.status} · ${e.code} · ${e.message}`;
  return e instanceof Error ? `${e.name}: ${e.message}` : String(e);
}

export async function probeAudioUpload(): Promise<ProbeResult> {
  const lines: string[] = [];
  const fail = (why: string): ProbeResult => {
    lines.push(`실패 · ${why}`, `시각(UTC) ${utc()}`);
    return { ok: false, lines };
  };

  if (uploadBackend() === 'none') return fail('이 빌드에 파일 업로드 모듈이 없습니다');

  const session = await loadSession();
  if (!session || isExpired(session)) return fail('로그인이 필요합니다');
  const token = session.accessToken;

  // 1. 대상 고르기 — 끝난 녹음만. 길이가 없는 것은 끝나지 않은 녹음이라 서버도 받지 않는다
  const repo = await getDreamRepo();
  const rows = await repo.list({});
  const target = rows.find((d) => d.audioPath != null && d.durationMs != null);
  if (!target?.audioPath) {
    return fail('끝난 음성 기록이 없습니다. 녹음을 하나 남긴 뒤 다시 눌러 주세요');
  }
  const bytes = await fileSize(target.audioPath);
  const size = bytes == null ? '크기 모름' : `${(bytes / 1024 / 1024).toFixed(2)}MB`;
  lines.push(`대상 ${target.id} · 녹음 ${Math.round((target.durationMs ?? 0) / 1000)}초 · ${size}`);

  // 2. 동기화 먼저. **서버에 없는 기록에는 업로드 자리를 주지 않는다**(404 dream_not_found)
  const report = await syncIfSignedIn({ force: true });
  if (report?.error) return fail(`동기화 · ${report.error}`);
  lines.push(`동기화 · 올림 ${report?.pushed ?? 0} · 건너뜀 ${report?.skipped ?? 0} · 받음 ${report?.pulled ?? 0}`);

  // 3. 업로드 자리
  let slot;
  try {
    slot = await requestUploadSlot(token, target.id);
  } catch (e) {
    return fail(`업로드 자리 · ${describe(e)}`);
  }
  lines.push(`업로드 자리 · ${slot.method} ${maskUrl(slot.uploadUrl)}`);
  lines.push(`  키 ${slot.key}`);
  lines.push(`  만료 ${slot.expiresAt} · 헤더 ${JSON.stringify(slot.headers)}`);

  // 4. 실제 PUT — 여기가 기기에서 처음 일어나는 구간이다
  let put;
  try {
    put = await putFile(slot.uploadUrl, target.audioPath, slot.headers);
  } catch (e) {
    return fail(`PUT · ${describe(e)}`);
  }
  lines.push(`PUT · HTTP ${put.status} · ${utc()}`);
  if (put.status < 200 || put.status >= 300) {
    lines.push(`  응답 ${put.body.slice(0, 600) || '(본문 없음)'}`);
    return fail('S3가 PUT을 거절했습니다. 403이면 Content-Type이 서명과 다른 것입니다');
  }

  // 5. 다 올렸다고 알린다
  let done;
  try {
    done = await completeUpload(token, target.id, slot.key);
  } catch (e) {
    return fail(`완료 알림 · ${describe(e)}`);
  }
  lines.push(`완료 알림 · sttStatus ${done.sttStatus}`);

  // 6. 받기에 audioUrl 이 내려오는지. **로컬에는 쓰지 않는다** — 보기만 한다
  let audioUrl: string | null = null;
  let found = false;
  try {
    let since: string | null = null;
    let cursor: string | null = null;
    for (let page = 0; page < 20; page += 1) {
      const res = await pullDreams(token, { since, cursor });
      const hit = res.dreams.find((d) => d.id === target.id);
      if (hit) {
        found = true;
        audioUrl = (hit as { audioUrl?: string | null }).audioUrl ?? null;
        break;
      }
      if (!res.hasMore || !res.nextSince) break;
      since = res.nextSince;
      cursor = res.nextCursor;
    }
  } catch (e) {
    return fail(`받기 · ${describe(e)}`);
  }
  if (!found) return fail('받기에서 그 기록을 찾지 못했습니다');
  lines.push(`받기 · audioUrl ${audioUrl ?? '없음(null)'}`);
  if (audioUrl == null) return fail('audioUrl이 비어 있습니다 — 서버가 파일을 확인하지 못했습니다');

  // 7. 변환 상태
  try {
    const stt = await fetchStt(token, target.id);
    lines.push(`변환 상태 · ${stt.status} · 시도 ${stt.attempts}회`);
    if (stt.status !== 'pending') lines.push(`  (지금은 pending 이 정상입니다 — 변환 서비스가 아직 없습니다)`);
  } catch (e) {
    return fail(`변환 상태 · ${describe(e)}`);
  }

  lines.push(`통과 · ${utc()}`);
  return { ok: true, lines };
}
