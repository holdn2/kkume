/**
 * 녹음 변환문 합치기 — `CLAUDE.md`의 `[녹음 변환]` 규칙과 문서 039 · 040의 판단 조건.
 *
 * 각 케이스는 "제대로 동작하면 참이어야 하는 것"을 확인한다.
 * **구현보다 먼저 짰다** — 구현 전에는 전부 실패해야 한다.
 */
import { decideMerge, mergeTranscript, TRANSCRIPT_MARKER } from '@shared/stt/merge';

const M = TRANSCRIPT_MARKER;

const mergeCases = [
  {
    key: 'M1',
    title: '음성만 남긴 기록(본문 없음)은 마커 없이 변환문만 들어간다',
    run: () => ({ got: mergeTranscript(null, '바다 위를 걸었다'), want: '바다 위를 걸었다' }),
  },
  {
    key: 'M2',
    title: '본문이 공백뿐이어도 음성만 남긴 기록으로 본다',
    run: () => ({ got: mergeTranscript('  \n ', '바다 위를 걸었다'), want: '바다 위를 걸었다' }),
  },
  {
    key: 'M3',
    title: '사용자가 적은 글은 덮지 않고 아래에 마커와 함께 이어 쓴다',
    run: () => ({
      got: mergeTranscript('고래를 봤다', '바다 위를 걸었다'),
      want: `고래를 봤다\n\n${M}\n바다 위를 걸었다`,
    }),
  },
  {
    key: 'M4',
    title: '본문 끝의 빈 줄은 정리하고 붙인다 — 빈 줄이 겹겹이 쌓이지 않는다',
    run: () => ({
      got: mergeTranscript('고래를 봤다\n\n\n', '바다 위를 걸었다'),
      want: `고래를 봤다\n\n${M}\n바다 위를 걸었다`,
    }),
  },
  {
    key: 'M5',
    title: '다시 변환하면 마커 아래를 통째로 갈아 끼운다 — 같은 문장이 쌓이지 않는다',
    run: () => ({
      got: mergeTranscript(`고래를 봤다\n\n${M}\n옛 변환문`, '새 변환문'),
      want: `고래를 봤다\n\n${M}\n새 변환문`,
    }),
  },
  {
    key: 'M6',
    title: '마커가 줄 가운데로 옮겨졌으면 마커로 보지 않고 맨 뒤에 붙인다',
    run: () => ({
      got: mergeTranscript(`메모 ${M} 뒤에 적음`, '바다 위를 걸었다'),
      want: `메모 ${M} 뒤에 적음\n\n${M}\n바다 위를 걸었다`,
    }),
  },
  {
    key: 'M7',
    title: '사용자가 마커를 지웠으면 맨 뒤에 붙인다 — 중복이 유실보다 낫다',
    run: () => ({
      got: mergeTranscript('고래를 봤다\n예전 변환문을 손봤다', '바다 위를 걸었다'),
      want: `고래를 봤다\n예전 변환문을 손봤다\n\n${M}\n바다 위를 걸었다`,
    }),
  },
  {
    key: 'M8',
    title: '5,000자를 넘어도 자르지 않는다(039 C5)',
    run: () => {
      const text = '가'.repeat(4900);
      const transcript = '나'.repeat(600);
      const got = mergeTranscript(text, transcript);
      return {
        got: `${got.length}자 · 끝이 변환문 ${got.endsWith(transcript)}`,
        want: `${4900 + `\n\n${M}\n`.length + 600}자 · 끝이 변환문 true`,
      };
    },
  },
  {
    key: 'M9',
    title: '변환문이 비어 있으면 본문을 건드리지 않는다',
    run: () => ({ got: mergeTranscript('고래를 봤다', '  '), want: '고래를 봤다' }),
  },
  {
    key: 'M10',
    title: '같은 변환문을 두 번 합쳐도 한 번 합친 것과 같다',
    run: () => {
      const once = mergeTranscript('고래를 봤다', '바다 위를 걸었다');
      return { got: mergeTranscript(once, '바다 위를 걸었다'), want: once };
    },
  },
];

const base = { audioUrl: 'audio/u1/d1/x.m4a', serverSttStatus: 'done', localSttStatus: 'pending', serverText: '고래를 봤다' };

const decideCases = [
  {
    key: 'D1',
    title: '서버에 오디오가 없으면(audioUrl null) 합치지 않는다 — sttStatus는 뜻이 없다',
    run: () => ({ got: decideMerge({ ...base, audioUrl: null }), want: 'skip' }),
  },
  {
    key: 'D2',
    title: '서버가 아직 변환 중(pending)이면 합치지 않는다',
    run: () => ({ got: decideMerge({ ...base, serverSttStatus: 'pending' }), want: 'skip' }),
  },
  {
    key: 'D3',
    title: '서버 변환이 실패(failed)했으면 합치지 않는다',
    run: () => ({ got: decideMerge({ ...base, serverSttStatus: 'failed' }), want: 'skip' }),
  },
  {
    key: 'D4',
    title: '서버 done · 로컬은 아직 안 합침 · 받은 본문에 마커 없음 → 합친다',
    run: () => ({ got: decideMerge(base), want: 'merge' }),
  },
  {
    key: 'D5',
    title: '이 폰에서 이미 합쳤으면(로컬 done) 다시 합치지 않는다 — 사용자가 고친 변환문을 지킨다',
    run: () => ({ got: decideMerge({ ...base, localSttStatus: 'done' }), want: 'skip' }),
  },
  {
    key: 'D6',
    title: '받은 본문에 마커가 이미 있으면 다른 기기가 합친 것 — 합치지 않고 done만 표시(C4)',
    run: () => ({ got: decideMerge({ ...base, serverText: `고래를 봤다\n\n${M}\n바다` }), want: 'mark-done' }),
  },
  {
    key: 'D7',
    title: '로컬이 failed여도 done이 아니면 합친다',
    run: () => ({ got: decideMerge({ ...base, localSttStatus: 'failed' }), want: 'merge' }),
  },
];

let failed = 0;
for (const c of [...mergeCases, ...decideCases]) {
  let ok;
  let detail;
  try {
    const { got, want } = c.run();
    ok = got === want;
    detail = ok ? '' : `\n            받음 ${JSON.stringify(got)}\n            기대 ${JSON.stringify(want)}`;
  } catch (e) {
    ok = false;
    detail = `\n            오류: ${e?.message ?? e}`;
  }
  if (!ok) failed += 1;
  console.log(`${c.key.padEnd(4)} ${ok ? '통과' : '실패'}  ${c.title}${detail}`);
}
console.log(`\n${mergeCases.length + decideCases.length}개 중 실패 ${failed}개`);
if (failed > 0) process.exitCode = 1;
