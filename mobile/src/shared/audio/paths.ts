import { requireOptionalNativeModule } from 'expo-modules-core';

import { getDreamRepo } from '@shared/db';

import { relocateRecordings, type RecordingFs, type RelocateReport } from './relocate';

/**
 * 폰의 실제 파일 시스템을 붙여 녹음 경로를 정리한다. 본체는 `relocate.ts` 에 있다.
 *
 * 파일 모듈(`expo-file-system` 옛 API)은 있는지 먼저 묻고 쓴다(절대 규칙 10).
 * 없으면 아무것도 하지 않고 null 을 돌려준다.
 */
const HAS_FILE_SYSTEM = requireOptionalNativeModule('ExponentFileSystem') != null;

function nativeRecordingFs(): RecordingFs | null {
  if (!HAS_FILE_SYSTEM) return null;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fs = require('expo-file-system/legacy');
  if (!fs.cacheDirectory || !fs.documentDirectory) return null;
  return {
    cacheDirectory: fs.cacheDirectory,
    documentDirectory: fs.documentDirectory,
    async size(path) {
      try {
        const info = await fs.getInfoAsync(path);
        return info?.exists ? ((info.size as number | undefined) ?? 0) : null;
      } catch {
        return null;
      }
    },
    async ensureDir(path) {
      await fs.makeDirectoryAsync(path, { intermediates: true }).catch(() => {});
    },
    async copy(from, to) {
      await fs.copyAsync({ from, to });
    },
    async remove(path) {
      await fs.deleteAsync(path, { idempotent: true });
    },
  };
}

let inFlight: Promise<RelocateReport | null> | null = null;

/**
 * 꿈 로그 탭과 진단 화면이 부른다. **두 곳이 겹쳐 부르면 같은 파일을 두 번 복사하므로**
 * 돌고 있는 것이 있으면 그 약속을 그대로 돌려준다.
 *
 * 새벽 흐름(기록 화면)에서는 부르지 않는다 — 파일 복사가 기록을 붙잡으면 안 된다(절대 규칙 1).
 */
export function repairRecordingPaths(): Promise<RelocateReport | null> {
  if (inFlight) return inFlight;
  inFlight = (async () => {
    try {
      const fs = nativeRecordingFs();
      if (!fs) return null;
      return await relocateRecordings(await getDreamRepo(), fs);
    } catch {
      return null;
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}
