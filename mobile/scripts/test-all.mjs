/**
 * 모바일 테스트를 한 번에 돌린다(이슈 #173).
 *
 *   node scripts/test-all.mjs              # scripts/ 아래 run.mjs 전부
 *   node scripts/test-all.mjs comic sync   # 이름에 든 것만
 *
 * 테스트마다 따로 `node scripts/<이름>/run.mjs`로 돌던 것을 순서대로 부르고, 하나라도 실패하면
 * 0이 아닌 코드로 끝난다(CI가 이걸 본다). 실행기들은 서로 상태를 나누지 않아 순서는 이름순이다.
 *
 * **`package.json`의 `scripts`에 `test`로 넣지 않는다** — `scripts`도 런타임 지문(fingerprint)에 들어가서,
 * 넣는 순간 지문이 갈라져 설치된 빌드로 OTA가 가지 않는다(2026-11-02 실측 `da5bb7de` → `537e9fb4`).
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const only = process.argv.slice(2);

const suites = fs
  .readdirSync(here, { withFileTypes: true })
  .filter((d) => d.isDirectory() && fs.existsSync(path.join(here, d.name, 'run.mjs')))
  .map((d) => d.name)
  .filter((name) => only.length === 0 || only.some((o) => name.includes(o)))
  .sort();

if (suites.length === 0) {
  console.error(`돌릴 테스트가 없어요: ${only.join(' ')}`);
  process.exit(1);
}

const failed = [];
for (const name of suites) {
  console.log(`\n━━ ${name}`);
  const r = spawnSync(process.execPath, [path.join(here, name, 'run.mjs')], { stdio: 'inherit' });
  if (r.status !== 0) failed.push(name);
}

console.log(`\n${suites.length}종 중 ${failed.length === 0 ? '모두 통과' : `실패 ${failed.length}종: ${failed.join(', ')}`}`);
process.exit(failed.length === 0 ? 0 : 1);
