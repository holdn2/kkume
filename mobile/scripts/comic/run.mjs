/**
 * 꿈 만화 테스트 실행기(이슈 #92).
 *
 *   node scripts/comic/run.mjs
 *
 * **새 의존성이 없다.** `sync-repro`와 같은 방식으로, 이미 설치된 esbuild가 TypeScript와
 * `@shared/*` · `@features/*` 별칭을 풀어 Node에서 돌린다. 네이티브 모듈은 `expo-modules-core`를
 * 가짜로 바꿔 끼워 "없음"으로 둔다. 화면 없이 가짜 만화 서버(`@features/comic/fake`)와 화면 계산만 본다.
 */
import { build } from 'esbuild';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const mobile = path.resolve(here, '..', '..');
const src = path.join(mobile, 'src');

function resolveSource(base) {
  for (const c of [`${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts'), path.join(base, 'index.tsx')]) {
    if (fs.existsSync(c)) return c;
  }
  return null;
}

const alias = {
  name: 'comic-alias',
  setup(b) {
    b.onResolve({ filter: /^expo-modules-core$/ }, () => ({
      path: path.join(mobile, 'scripts', 'sync-repro', 'stub-expo-modules-core.mjs'),
    }));
    b.onResolve({ filter: /^@(shared|features)\// }, (args) => {
      const [, root, rest] = /^@(shared|features)\/(.*)$/.exec(args.path);
      const p = resolveSource(path.join(src, root, rest));
      if (!p) throw new Error(`별칭을 못 찾음: ${args.path}`);
      return { path: p };
    });
  },
};

const outfile = path.join(os.tmpdir(), `kkume-comic-${process.pid}.mjs`);
await build({
  entryPoints: [path.join(here, 'cases.mjs')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  outfile,
  plugins: [alias],
  external: ['expo-secure-store', 'react-native', 'react', 'expo-sqlite'],
  logLevel: 'error',
});

try {
  await import(pathToFileURL(outfile).href);
} finally {
  fs.rmSync(outfile, { force: true });
}
