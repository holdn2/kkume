/**
 * 받아쓰기 한 번의 흐름(`session.ts`) — 라이브러리 이벤트를 대본으로 흘려 확인한다(문서 052 02장 T2 · T6 · T7).
 *
 * 가짜 모듈은 `expo-speech-recognition@57.1.0` iOS가 보내는 순서를 따른다 —
 * `start` → `audiostart{uri}` → `result`… → (`error`) → `end`. `stop`은 마지막 결과 뒤 `end`,
 * `abort`는 `error{aborted}` 뒤 `end`. 시계와 타이머는 손으로 돌린다.
 */
import {
  createDictationSession,
  END_TIMEOUT_MS,
  FALLBACK_WINDOW_MS,
  STOP_GRACE_MS,
} from '@shared/dictation/session';

const DOCS = 'file:///var/mobile/Containers/Data/Application/NOW/Documents/';
const WAV = `${DOCS}ExpoAudio/recording_A.wav`;

function rig({ bytes = 44 + 32000 * 5 } = {}) {
  const listeners = new Map();
  const calls = [];
  let clock = 1_000_000;
  let timers = [];
  const module = {
    addListener(ev, fn) {
      const set = listeners.get(ev) ?? new Set();
      set.add(fn);
      listeners.set(ev, set);
      return { remove: () => set.delete(fn) };
    },
    start: (o) => calls.push(['start', o]),
    stop: () => calls.push(['stop']),
    abort: () => calls.push(['abort']),
  };
  const view = { recording: false, level: 0 };
  const log = { text: [], ended: [], fallback: [] };
  const session = createDictationSession(
    {
      module,
      fileSize: async (uri) => (uri === WAV ? bytes : null),
      now: () => clock,
      setTimer: (fn, ms) => timers.push({ at: clock + ms, fn }),
      documentDirectory: DOCS,
    },
    { onRecording: (on) => (view.recording = on), onLevel: (l) => (view.level = l) },
  );
  const handlers = {
    onText: (t, f) => log.text.push([t, f]),
    onEnded: (end, reason) => log.ended.push({ end, reason }),
    onFallback: (reason) => log.fallback.push(reason),
  };
  const emit = (ev, payload = null) => [...(listeners.get(ev) ?? [])].forEach((fn) => fn(payload));
  const advance = (ms) => {
    clock += ms;
    const due = timers.filter((t) => t.at <= clock);
    timers = timers.filter((t) => t.at > clock);
    due.forEach((t) => t.fn());
  };
  const flush = () => new Promise((r) => setTimeout(r, 0));
  const live = () => [...listeners.values()].reduce((n, s) => n + s.size, 0);
  return { session, handlers, emit, advance, flush, calls, view, log, live, names: () => calls.map((c) => c[0]) };
}

const result = (isFinal, transcript) => ({ isFinal, results: [{ transcript }] });

/** 시작해서 파일을 연 상태까지 */
async function opened(r) {
  const p = r.session.start(r.handlers);
  r.emit('start');
  r.emit('audiostart', { uri: WAV });
  return p;
}

export const sessionCases = [
  {
    key: 'S1',
    title: '파일이 열리면 경로를 돌려주고, 정지하면 마지막 결과 뒤 end 에서 글 · 길이(파일 크기)와 함께 끝난다',
    run: async () => {
      const r = rig();
      const uri = await opened(r);
      r.emit('result', result(true, '바다 위를 걸었다'));
      r.emit('result', result(false, ' 고래가'));
      const p = r.session.stop();
      r.emit('result', result(true, ' 고래가 나를 봤다'));
      r.emit('end');
      const end = await p;
      return {
        got: [uri, r.names(), end, r.log.ended.length, r.view.recording, r.live()],
        want: [WAV, ['start', 'stop'], { uri: WAV, durationMs: 5000, text: '바다 위를 걸었다 고래가 나를 봤다' }, 0, false, 0],
      };
    },
  },
  {
    key: 'S2',
    title: '시작 옵션 — 한국어 · 기기 안 · 연속 · Documents/ExpoAudio · 16kHz Int16',
    run: async () => {
      const r = rig();
      await opened(r);
      const o = r.calls[0][1];
      return {
        got: [o.lang, o.requiresOnDeviceRecognition, o.continuous, o.interimResults, o.recordingOptions],
        want: ['ko-KR', true, true, true, { persist: true, outputDirectory: `${DOCS}ExpoAudio`, outputSampleRate: 16000, outputEncoding: 'pcmFormatInt16' }],
      };
    },
  },
  {
    key: 'S3',
    title: '파일을 못 만들면(audiostart uri 없음) 시작이 실패하고 인식을 끊는다 — 원본 없는 기록을 만들지 않는다',
    run: async () => {
      const r = rig();
      const p = r.session.start(r.handlers);
      r.emit('audiostart', { uri: null });
      const e = await p.then(() => null, (x) => x.message);
      r.emit('error', { error: 'aborted', message: '' });
      r.emit('end');
      await r.flush();
      return { got: [!!e, r.names().includes('abort'), r.log.ended.length, r.log.fallback.length], want: [true, true, 0, 0] };
    },
  },
  {
    key: 'S4',
    title: '파일을 열기 전 오류(권한 · 모델)면 시작이 실패한다',
    run: async () => {
      const r = rig();
      const p = r.session.start(r.handlers);
      r.emit('error', { error: 'not-allowed', message: 'x' });
      r.emit('end');
      const e = await p.then(() => null, (x) => x.message);
      return { got: [e?.startsWith('not-allowed'), r.log.ended.length], want: [true, 0] };
    },
  },
  {
    key: 'S5',
    title: '파일도 오류도 없이 end 만 오면 시작이 실패한다 — 녹음 화면이 멈춘 채 남지 않는다',
    run: async () => {
      const r = rig();
      const p = r.session.start(r.handlers);
      r.emit('end');
      const settled = await Promise.race([p.then(() => 'resolved', () => 'rejected'), r.flush().then(() => 'hanging')]);
      return { got: settled, want: 'rejected' };
    },
  },
  {
    key: 'S6',
    title: '열린 직후 모델 없음(service-not-allowed)으로 끝나면 녹음기로 넘어가라고 알린다',
    run: async () => {
      const r = rig();
      await opened(r);
      r.advance(500);
      r.emit('error', { error: 'service-not-allowed', message: 'Assets are not installed' });
      r.emit('end');
      await r.flush();
      return { got: [r.log.fallback, r.log.ended.length], want: [['service-not-allowed'], 0] };
    },
  },
  {
    key: 'S7',
    title: '한참 뒤의 같은 오류는 넘어가지 않고 끝으로 본다 — 그 WAV 가 기록에서 떨어지지 않게',
    run: async () => {
      const r = rig();
      await opened(r);
      r.advance(FALLBACK_WINDOW_MS + 1);
      r.emit('error', { error: 'service-not-allowed', message: '' });
      r.emit('end');
      await r.flush();
      return { got: [r.log.fallback.length, r.log.ended.length, r.log.ended[0]?.end.uri], want: [0, 1, WAV] };
    },
  },
  {
    key: 'S8',
    title: '열린 직후라도 이미 받아쓴 글이 있으면 넘어가지 않고 끝으로 본다',
    run: async () => {
      const r = rig();
      await opened(r);
      r.emit('result', result(false, '바다'));
      r.emit('error', { error: 'service-not-allowed', message: '' });
      r.emit('end');
      await r.flush();
      return { got: [r.log.fallback.length, r.log.ended[0]?.end.text], want: [0, '바다'] };
    },
  },
  {
    key: 'S9',
    title: '멈추지 않았는데 끝나면(전화 · 이어폰) 진행 중 구간까지 넣어 onEnded 로 알린다',
    run: async () => {
      const r = rig();
      await opened(r);
      r.emit('result', result(true, '바다 위를 걸었다'));
      r.emit('result', result(false, ' 고래가'));
      r.advance(FALLBACK_WINDOW_MS + 10);
      r.emit('error', { error: 'interrupted', message: '' });
      r.emit('end');
      await r.flush();
      const e = r.log.ended[0];
      return { got: [e?.reason, e?.end.text, e?.end.uri, r.live()], want: ['interrupted', '바다 위를 걸었다 고래가', WAV, 0] };
    },
  },
  {
    key: 'S10',
    title: '정지했는데 마지막 결과가 안 오면 2초 뒤 abort 로 끊는다',
    run: async () => {
      const r = rig();
      await opened(r);
      const p = r.session.stop();
      r.advance(STOP_GRACE_MS);
      const afterGrace = r.names();
      r.emit('error', { error: 'aborted', message: '' });
      r.emit('end');
      const end = await p;
      return { got: [afterGrace, end.uri, r.log.ended.length], want: [['start', 'stop', 'abort'], WAV, 0] };
    },
  },
  {
    key: 'S11',
    title: 'end 가 끝내 안 오면 4초 뒤 있는 것으로 끝낸다 — 정지 버튼이 멈춘 채 남지 않는다',
    run: async () => {
      const r = rig();
      await opened(r);
      r.emit('result', result(false, '바다'));
      const p = r.session.stop();
      r.advance(END_TIMEOUT_MS);
      const end = await Promise.race([p, r.flush().then(() => 'hanging')]);
      return { got: end === 'hanging' ? end : end.text, want: '바다' };
    },
  },
  {
    key: 'S12',
    title: '백그라운드용 abort 는 곧바로 끊고 end 에서 끝낸다 — onEnded 로 새지 않는다',
    run: async () => {
      const r = rig();
      await opened(r);
      r.emit('result', result(false, '바다'));
      const p = r.session.abort();
      r.emit('error', { error: 'aborted', message: '' });
      r.emit('end');
      const end = await p;
      return { got: [r.names(), end.text, r.log.ended.length], want: [['start', 'abort'], '바다', 0] };
    },
  },
  {
    key: 'S13',
    title: '예기치 않게 끝난 뒤 정지를 눌러도 곧바로 끝난다(4초를 기다리지 않는다)',
    run: async () => {
      const r = rig();
      await opened(r);
      r.advance(FALLBACK_WINDOW_MS + 10);
      r.emit('end');
      await r.flush();
      const end = await Promise.race([r.session.stop(), r.flush().then(() => 'hanging')]);
      return { got: [end === 'hanging' ? end : end.uri, r.names()], want: [WAV, ['start']] };
    },
  },
  {
    key: 'S14',
    title: '돌고 있을 때 화면을 떠나면 끊는다 — 시작 중이어도(파일 열기 전)',
    run: async () => {
      const a = rig();
      void a.session.start(a.handlers).catch(() => {});
      a.session.dispose();
      const b = rig();
      await opened(b);
      b.emit('end');
      await b.flush();
      b.session.dispose();
      return { got: [a.names(), a.live(), b.names()], want: [['start', 'abort'], 0, ['start']] };
    },
  },
  {
    key: 'S15',
    title: '파일 크기를 못 재면 시계로 길이를 잰다',
    run: async () => {
      const r = rig({ bytes: null });
      await opened(r);
      r.advance(7000);
      const p = r.session.stop();
      r.emit('end');
      const end = await p;
      return { got: end.durationMs, want: 7000 };
    },
  },
];
