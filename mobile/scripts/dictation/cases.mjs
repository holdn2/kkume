/**
 * 녹음하면서 받아쓰기 — 순수 로직(문서 052 02장 T3 · T8 · T9, 03장).
 *
 * 각 케이스는 "제대로 동작하면 참이어야 하는 것"을 확인한다. **구현보다 먼저 짰다.**
 * 이벤트 모양은 `expo-speech-recognition@57.1.0` iOS 소스에서 가져왔다 —
 * `result` 는 `{ isFinal, results: [{ transcript }] }` 이고, iOS 18 은 한 세션에 확정이 여러 번,
 * 두 번째 구간부터 앞에 공백이 붙는다(`ExpoSpeechRecognitionModule.swift:459 · 466`).
 */
import {
  applyResult,
  dictatedText,
  EMPTY_DICTATION,
  pickEngine,
  settle,
  volumeToLevel,
  wavDurationMs,
} from '@shared/dictation/compose';
import { mergeTranscript, TRANSCRIPT_MARKER } from '@shared/stt/merge';

const M = TRANSCRIPT_MARKER;

/** 이벤트 목록을 차례로 먹인 결과의 글 */
function feed(events, { finish = false } = {}) {
  let s = EMPTY_DICTATION;
  for (const [isFinal, transcript] of events) s = applyResult(s, isFinal, transcript);
  if (finish) s = settle(s);
  return dictatedText(s);
}

const ok = { hasModule: true, speechGranted: true, micGranted: true, localeKo: true, onDevice: true };

const cases = [
  // 구간 합치기 — iOS 18
  {
    key: 'D1',
    title: 'iOS 18: 확정된 구간은 이어 붙고, 진행 중 구간은 매번 갈아 끼운다',
    run: () => ({
      got: feed([
        [false, '바다'],
        [false, '바다 위를'],
        [true, '바다 위를 걸었다'],
        [false, ' 고래가'],
        [false, ' 고래가 나를'],
      ]),
      want: '바다 위를 걸었다 고래가 나를',
    }),
  },
  {
    key: 'D2',
    title: 'iOS 18: 두 번째 구간부터 붙는 앞 공백 때문에 공백이 겹치지 않는다',
    run: () => ({
      got: feed([
        [true, '바다 위를 걸었다'],
        [true, ' 고래가 나를 봤다'],
      ]),
      want: '바다 위를 걸었다 고래가 나를 봤다',
    }),
  },
  {
    key: 'D3',
    title: 'iOS 18: 끝의 진짜 확정이 마지막 구간을 되풀이해도 두 번 들어가지 않는다',
    run: () => ({
      got: feed([
        [true, '바다 위를 걸었다'],
        [true, ' 고래가 나를 봤다'],
        [true, ' 고래가 나를 봤다'],
      ]),
      want: '바다 위를 걸었다 고래가 나를 봤다',
    }),
  },
  {
    key: 'D4',
    title: '같은 문장을 실제로 두 번 말한 것은(사이에 다른 구간) 둘 다 남는다',
    run: () => ({
      got: feed([
        [true, '무서웠다'],
        [true, ' 도망쳤다'],
        [true, ' 무서웠다'],
      ]),
      want: '무서웠다 도망쳤다 무서웠다',
    }),
  },
  // iOS 17 이하 — 끝까지 한 구간
  {
    key: 'D5',
    title: 'iOS 17: 진행 중 구간만 자라다가 끝에 한 번 확정된다 — 도중의 글도 읽힌다',
    run: () => ({
      got: [feed([[false, '바다'], [false, '바다 위를 걸었다']]), feed([[false, '바다'], [true, '바다 위를 걸었다']])],
      want: ['바다 위를 걸었다', '바다 위를 걸었다'],
    }),
  },
  {
    key: 'D6',
    title: '빈 결과는 진행 중 구간을 지우지 않는다',
    run: () => ({ got: feed([[false, '바다 위를'], [false, ''], [true, '  ']]), want: '바다 위를' }),
  },
  {
    key: 'D7',
    title: '확정 없이 끝나면(abort) 진행 중 구간을 확정으로 넘긴다 — 잃지 않는다',
    run: () => {
      let s = applyResult(EMPTY_DICTATION, true, '바다 위를 걸었다');
      s = applyResult(s, false, ' 고래가');
      s = settle(s);
      return { got: [dictatedText(s), s.interim], want: ['바다 위를 걸었다 고래가', ''] };
    },
  },
  {
    key: 'D8',
    title: 'settle 은 여러 번 불러도 같다',
    run: () => {
      const s = settle(applyResult(EMPTY_DICTATION, false, '바다'));
      return { got: dictatedText(settle(s)), want: '바다' };
    },
  },
  // 적은 글과 합치기 — 되돌리기 양방향(052 03장)
  {
    key: 'W1',
    title: '적기 → 음성: 적은 글 아래 마커와 받아쓴 글',
    run: () => ({ got: mergeTranscript('고래를 봤다', '바다 위를 걸었다'), want: `고래를 봤다\n\n${M}\n바다 위를 걸었다` }),
  },
  {
    key: 'W2',
    title: '음성 → 적기: 받아쓴 글이 있어도 타이핑한 글이 그것을 지우지 않는다',
    run: () => ({ got: mergeTranscript('이어서 적는다', '바다 위를 걸었다'), want: `이어서 적는다\n\n${M}\n바다 위를 걸었다` }),
  },
  {
    key: 'W3',
    title: '받아쓴 글이 아직 없으면 적은 글 그대로(마커 없음)',
    run: () => ({ got: mergeTranscript('고래를 봤다', ''), want: '고래를 봤다' }),
  },
  // 녹음기 고르기
  {
    key: 'E1',
    title: '다섯 조건이 모두 맞을 때만 받아쓰기',
    run: () => ({ got: pickEngine(ok).engine, want: 'dictation' }),
  },
  {
    key: 'E2',
    title: '하나라도 아니면 지금의 녹음기, 떨어진 조건을 이유로 남긴다',
    run: () => ({
      got: ['hasModule', 'speechGranted', 'micGranted', 'localeKo', 'onDevice'].map((k) => {
        const r = pickEngine({ ...ok, [k]: false });
        return `${r.engine}:${r.reason}`;
      }),
      want: [
        'audio:module',
        'audio:speech-permission',
        'audio:mic-permission',
        'audio:locale',
        'audio:on-device',
      ],
    }),
  },
  // WAV 길이 · 파형
  {
    key: 'L1',
    title: 'WAV 길이 — 16kHz · 16bit · mono 는 초당 32,000바이트, 헤더 44바이트',
    run: () => ({
      got: [wavDurationMs(44 + 32000 * 60), wavDurationMs(44 + 16000), wavDurationMs(44), wavDurationMs(10), wavDurationMs(null)],
      want: [60000, 500, 0, 0, null],
    }),
  },
  {
    key: 'V1',
    title: 'volumechange(-2~10)를 파형의 0~1로',
    run: () => ({ got: [volumeToLevel(-2), volumeToLevel(4), volumeToLevel(10), volumeToLevel(-5), volumeToLevel(99)], want: [0, 0.5, 1, 0, 1] }),
  },
];

let failed = 0;
for (const c of cases) {
  let got;
  let want;
  let error = null;
  try {
    ({ got, want } = c.run());
  } catch (e) {
    error = e;
  }
  const pass = !error && JSON.stringify(got) === JSON.stringify(want);
  if (!pass) failed += 1;
  console.log(`${c.key}  ${pass ? '정상' : '실패'} ${c.title}`);
  if (!pass) console.log(`            ${error ? `예외 ${error.message}` : `받음 ${JSON.stringify(got)}\n            기대 ${JSON.stringify(want)}`}`);
}
console.log(`\n${cases.length}개 중 실패 ${failed}개`);
if (failed) process.exitCode = 1;
