/**
 * 앱 복귀 뒤 동기화(`afterForeground`) 테스트 실행기(이슈 #187).
 *
 *   node scripts/foreground/run.mjs
 *
 * **새 의존성이 없다.** `sync-repro`와 같은 방식으로, 이미 설치된 esbuild가
 * TypeScript와 `@shared/*` 별칭을 풀어 Node에서 돌린다. 앱 상태와 타이머는
 * 손으로 돌린다.
 *
 * 하나라도 틀리면 종료 코드 1로 끝난다.
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

const alias = {
  name: 'foreground-alias',
  setup(b) {
    b.onResolve({ filter: /^@shared\// }, (args) => {
      const p = resolveSource(path.join(shared, args.path.slice('@shared/'.length)));
      if (!p) throw new Error(`별칭을 못 찾음: ${args.path}`);
      return { path: p };
    });
  },
};

const outfile = path.join(os.tmpdir(), `kkume-foreground-${process.pid}.mjs`);
await build({
  entryPoints: [path.join(here, 'cases.mjs')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  outfile,
  plugins: [alias],
  logLevel: 'error',
});

try {
  await import(pathToFileURL(outfile).href);
} finally {
  fs.rmSync(outfile, { force: true });
}
