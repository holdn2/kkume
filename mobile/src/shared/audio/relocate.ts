import type { DreamRepo } from '@shared/db';

/**
 * 녹음 경로 정리 — 원본 오디오를 잃지 않게 한다(절대 규칙 2).
 *
 * 두 가지를 고친다.
 *
 * 1. **캐시 폴더의 녹음을 Documents 로 옮긴다.** `expo-audio`는 `directory` 옵션이 없으면
 *    iOS 캐시 폴더에 녹음하는데(`AudioRecorder.swift`), 캐시는 공간이 부족하면 시스템이 지운다.
 *    2026-09-21 이전 녹음이 전부 거기 있었고 9/16 녹음 3건은 이미 사라졌다.
 * 2. **바뀐 앱 컨테이너 경로를 고친다.** 경로는 `…/Application/<UUID>/Documents/…` 처럼 전체로
 *    저장되는데, iOS 는 새 빌드로 업데이트할 때 이 UUID 를 바꿀 수 있다. 파일은 그대로 있어도
 *    저장된 경로가 틀어진다. 같은 파일 이름을 지금 컨테이너에서 찾아 고친다.
 *    (우리 기기에서 빌드를 새로 깐 뒤 확인한 적은 아직 없다 — 알려진 iOS 동작이라 미리 막는다)
 *
 * **옮기는 순서는 복사 → 경로 변경 → 원본 삭제다.** 이동(rename)을 쓰지 않는 이유는, 옮긴 직후
 * 경로를 바꾸기 전에 앱이 꺼지면 기록이 가리키는 파일이 없어지기 때문이다. 이 순서면 어디서
 * 꺼져도 기록이 가리키는 파일은 있다. 복사 뒤에 꺼졌으면 다음에 목적지 크기를 보고 이어간다.
 *
 * 경로를 바꾸는 것은 동기화 대상이 아니다 — 서버는 `audioPath` 를 받지 않는다. 그래서 수정 시각을
 * 올리지 않는 `setAudioPath` 를 쓴다.
 */

/** 파일 시스템에서 이 일에 쓰는 것만. 테스트는 가짜를 넣는다 */
export type RecordingFs = {
  /** 끝에 `/` 가 붙은 `file://` 경로 */
  cacheDirectory: string;
  documentDirectory: string;
  /** 없으면 null */
  size(path: string): Promise<number | null>;
  ensureDir(path: string): Promise<void>;
  copy(from: string, to: string): Promise<void>;
  remove(path: string): Promise<void>;
};

export type RelocateReport = {
  /** 캐시에서 Documents 로 옮긴 수 */
  moved: number;
  /** 바뀐 컨테이너 경로를 지금 경로로 고친 수 */
  repointed: number;
  /** 파일이 어디에도 없는 수 — 이미 잃은 녹음이다 */
  missing: number;
  failed: number;
  /**
   * 지금 캐시 · Documents 어느 쪽도 아닌 경로인데 그 자리에 파일이 있는 수.
   * 0 이 아니면 경로 모양이 예상과 다른 것이라, 옮기지 못한 녹음이 남아 있을 수 있다
   */
  other: number;
};

/** expo-audio 가 녹음 파일을 만드는 하위 폴더 이름(`AudioUtils.swift`) */
const SUBDIR = 'ExpoAudio/';

const basename = (p: string) => p.slice(p.lastIndexOf('/') + 1);

export async function relocateRecordings(
  repo: Pick<DreamRepo, 'list' | 'setAudioPath'>,
  fs: RecordingFs,
): Promise<RelocateReport> {
  const report: RelocateReport = { moved: 0, repointed: 0, missing: 0, failed: 0, other: 0 };
  const destDir = fs.documentDirectory + SUBDIR;
  let dirReady = false;

  // 지운 기록도 본다 — 되살릴 수 있고, 그때 원본이 있어야 한다
  const rows = await repo.list({ includeDeleted: true });
  for (const d of rows) {
    const path = d.audioPath;
    if (!path) continue;
    // 지금 컨테이너의 Documents 에 있으면 할 일이 없다
    if (path.startsWith(fs.documentDirectory)) continue;

    const dest = destDir + basename(path);
    try {
      if (path.startsWith(fs.cacheDirectory)) {
        const srcSize = await fs.size(path);
        if (srcSize == null) {
          // 원본이 없다. 복사 · 경로 변경 사이가 아니라 원본 삭제 뒤에 꺼진 것일 수도 있으니 목적지를 본다
          if ((await fs.size(dest)) != null) {
            await repo.setAudioPath(d.id, dest);
            report.moved += 1;
          } else {
            report.missing += 1;
          }
          continue;
        }

        const destSize = await fs.size(dest);
        if (destSize !== srcSize) {
          // 크기가 다른 목적지는 도중에 끊긴 복사다. 지우고 다시 복사한다
          if (destSize != null) await fs.remove(dest);
          if (!dirReady) {
            await fs.ensureDir(destDir);
            dirReady = true;
          }
          await fs.copy(path, dest);
          if ((await fs.size(dest)) !== srcSize) {
            report.failed += 1;
            continue;
          }
        }
        await repo.setAudioPath(d.id, dest);
        // 원본 삭제가 실패해도 괜찮다. 기록은 이미 Documents 를 가리킨다
        await fs.remove(path).catch(() => {});
        report.moved += 1;
        continue;
      }

      // 지금 캐시 · Documents 어느 쪽도 아니다 — 다른 컨테이너의 경로이거나 모양이 다른 경로다
      if ((await fs.size(path)) != null) {
        report.other += 1;
        continue;
      }
      let found: string | null = null;
      for (const candidate of [dest, fs.cacheDirectory + SUBDIR + basename(path)]) {
        if ((await fs.size(candidate)) != null) {
          found = candidate;
          break;
        }
      }
      if (found) {
        // 캐시에서 찾았으면 다음 정리 때 Documents 로 옮겨진다
        await repo.setAudioPath(d.id, found);
        report.repointed += 1;
      } else {
        report.missing += 1;
      }
    } catch {
      report.failed += 1;
    }
  }
  return report;
}
