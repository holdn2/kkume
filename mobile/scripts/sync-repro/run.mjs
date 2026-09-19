/**
 * 동기화 재현 테스트 실행기.
 *
 *   node scripts/sync-repro/run.mjs            # 전부
 *   ONLY=A,C node scripts/sync-repro/run.mjs   # 골라서
 *
 * **새 의존성이 없다.** SQLite는 Node 22 내장(`node:sqlite`)이고, TypeScript와 `@shared/*`
 * 별칭은 이미 설치돼 있는 esbuild로 묶는다. `package.json`을 건드리지 않는 이유는
 * 이 브랜치가 설치된 빌드와 같은 지문을 유지해야 OTA로 확인할 수 있어서다.
 *
 * 바꿔 끼우는 것은 넷이다 — `@shared/db`(저장소 주입) · `@shared/api/sync`(가짜 서버) ·
 * `expo-modules-core`(네이티브 없음). 나머지는 앱 코드 그대로다.
 */
import { build } from 'esbuild';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const shared = path.resolve(here, '..', '..', 'src', 'shared');

function resolveSource(base) {
  for (const c of [`${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts'), path.join(base, 'index.tsx')]) {
    if (fs.existsSync(c)) return c;
  }
  return null;
}

const swap = {
  name: 'sync-repro-swap',
  setup(b) {
    // 가짜 서버는 테스트와 앱 코드가 **같은 경로로** 불러야 한 벌만 생긴다
    b.onResolve({ filter: /^@shared\/api\/sync$/ }, () => ({ path: path.join(here, 'fake-server.mjs') }));
    // 오디오 업로드 엔드포인트도 같은 가짜 서버가 답한다. 파일 PUT 은 네이티브라 따로 바꿔 끼운다
    b.onResolve({ filter: /^@shared\/api\/audio$/ }, () => ({ path: path.join(here, 'fake-server.mjs') }));
    b.onResolve({ filter: /^@shared\/audio\/upload$/ }, () => ({ path: path.join(here, 'fake-upload.mjs') }));
    b.onResolve({ filter: /^@shared\/db$/ }, () => ({ path: path.join(here, 'db-shim.mjs') }));
    b.onResolve({ filter: /^expo-modules-core$/ }, () => ({ path: path.join(here, 'stub-expo-modules-core.mjs') }));
    b.onResolve({ filter: /^@shared\// }, (args) => {
      const p = resolveSource(path.join(shared, args.path.slice('@shared/'.length)));
      if (!p) throw new Error(`별칭을 못 찾음: ${args.path}`);
      return { path: p };
    });
  },
};

const outfile = path.join(os.tmpdir(), `kkume-sync-repro-${process.pid}.mjs`);
await build({
  entryPoints: [path.join(here, 'scenarios.mjs')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  outfile,
  plugins: [swap],
  // 함수 안에서만 require 하고 테스트 경로에서는 부르지 않는 네이티브 모듈들
  external: ['expo-sqlite', 'expo-secure-store', 'expo-constants', 'react-native'],
  logLevel: 'error',
});

try {
  await import(pathToFileURL(outfile).href);
} finally {
  fs.rmSync(outfile, { force: true });
}
