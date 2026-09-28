import { requireOptionalNativeModule } from 'expo-modules-core';

import { getDreamRepo, type Dream } from '@shared/db';

import { mmss } from './types';

/**
 * 녹음이 있는 기록을 전부 훑어, 목록의 00:00 과 "재생해도 소리가 없다"를 가르는 사실을 모은다.
 *
 * 2026-09-26 기기에서 옛 녹음 여럿이 00:00 으로 보였다. 목록의 00:00 은 **저장된 길이가 0** 이라는
 * 뜻인데(길이를 모르면 `--:--`), 파일이 멀쩡한데 길이만 0 으로 저장된 것인지, 파일이 망가져
 * (마무리 안 된 녹음 · 헤더 없음) 애초에 못 읽는 것인지는 파일을 열어 봐야 갈린다.
 * 추측으로 고치지 않으려고 기록마다 저장값과 파일의 사실을 나란히 보여준다.
 */
export type RecordingFacts = {
  id: string;
  recordedAt: string;
  deleted: boolean;
  storedMs: number | null;
  /** 지금 앱의 Documents · 캐시 · 그 밖(옛 컨테이너 · 다른 모양) */
  place: 'documents' | 'cache' | 'other';
  bytes: number | null;
  /** 파일을 재생기로 열어 읽은 길이. 못 읽으면 null */
  fileMs: number | null;
};

const HAS_FILE_SYSTEM = requireOptionalNativeModule('ExponentFileSystem') != null;
// 배럴(index)을 거치지 않는다 — 폴더 안에서는 직접 묻는다(CLAUDE.md 배럴 규칙)
const HAS_NATIVE_AUDIO = requireOptionalNativeModule('ExpoAudio') != null;

export async function inspectRecordings(): Promise<RecordingFacts[] | null> {
  if (!HAS_FILE_SYSTEM || !HAS_NATIVE_AUDIO) return null;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fs = require('expo-file-system/legacy');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { readFileDurationMs } = require('./native') as typeof import('./native');

  const repo = await getDreamRepo();
  const rows = (await repo.list({ includeDeleted: true })).filter((d: Dream) => !!d.audioPath);
  const out: RecordingFacts[] = [];
  for (const d of rows) {
    const path = d.audioPath as string;
    let bytes: number | null = null;
    try {
      const info = await fs.getInfoAsync(path);
      bytes = info?.exists ? ((info.size as number | undefined) ?? 0) : null;
    } catch {
      bytes = null;
    }
    const place = path.startsWith(fs.documentDirectory)
      ? 'documents'
      : path.startsWith(fs.cacheDirectory)
        ? 'cache'
        : 'other';
    // 없는 파일은 열어 볼 것도 없다. 열면 3초씩 기다린다
    const fileMs = bytes ? await readFileDurationMs(path).catch(() => null) : null;
    out.push({
      id: d.id,
      recordedAt: d.recordedAt,
      deleted: !!d.deletedAt,
      storedMs: d.durationMs ?? null,
      place,
      bytes,
      fileMs,
    });
  }
  return out;
}

const PLACE = { documents: '문서', cache: '캐시', other: '그 밖' } as const;

/** 진단 화면에 한 줄씩. 맨 위에 묶어 센 것을 둔다 — 스크린샷 한 장으로 판정하려고 */
export function formatRecordingFacts(list: RecordingFacts[]): string {
  const zero = list.filter((f) => f.storedMs === 0).length;
  const missing = list.filter((f) => f.bytes == null).length;
  const unreadable = list.filter((f) => f.bytes != null && f.fileMs == null).length;
  const lines = [
    `녹음 ${list.length}건 · 저장 길이 0 ${zero} · 파일 없음 ${missing} · 파일은 있는데 못 읽음 ${unreadable}`,
  ];
  for (const f of list) {
    const size = f.bytes == null ? '파일 없음' : `${Math.round(f.bytes / 1024)}KB`;
    const read = f.bytes == null ? '' : ` · 파일 길이 ${f.fileMs == null ? '못 읽음' : mmss(f.fileMs)}`;
    lines.push(
      `${f.recordedAt.slice(5, 16).replace('T', ' ')}${f.deleted ? '(지움)' : ''} · 저장 ${mmss(f.storedMs)} · ${PLACE[f.place]} · ${size}${read}`,
    );
  }
  return lines.join('\n');
}
