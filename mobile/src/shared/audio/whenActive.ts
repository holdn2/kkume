/**
 * 앱이 **완전히 앞에 나온 뒤에** 한 번 부른다. 이미 앞이면 곧바로 부른다.
 *
 * 잠금화면 위젯으로 들어오면 앱이 아직 앞으로 나오는 중(`inactive`)일 때 녹음 화면이 열린다.
 * 그때 받아쓰기를 켜면 오디오 세션을 바꾸는 일이 경로 변경 알림을 일으키고, 라이브러리는 그 순간
 * 앱이 `active`가 아니면 "앱이 내려가는 중"으로 보고 인식을 끝낸다
 * (`expo-speech-recognition` `ExpoSpeechRecognizer.swift` `handleAudioRouteChange`).
 * 화면은 그것을 예기치 않은 끝으로 받아 꿈 로그로 보낸다 — 위젯에서만 녹음이 곧바로 끊겼다(이슈 #125).
 *
 * RN 의 `AppState`를 그대로 받지 않고 모양만 받는 것은 테스트 때문이다(`scripts/dictation`).
 */

export type AppStateLike = {
  currentState: string;
  addEventListener: (type: 'change', listener: (state: string) => void) => { remove: () => void };
};

export type Timers = {
  set: (fn: () => void, ms: number) => unknown;
  clear: (handle: unknown) => void;
};

/**
 * `active` 이벤트가 끝내 안 오면 이만큼 뒤에 그냥 시작한다. `currentState`가 늦게 바뀌어
 * 실제로는 앞인데 기다리기만 하면 **녹음이 아예 안 켜진다** — 그건 끊기는 것보다 나쁘다.
 * 그때 `background`면 시작하지 않는다. 백그라운드에서는 녹음을 켜지 않는다(record.tsx)
 */
export const ACTIVE_WAIT_MS = 3000;

const defaultTimers: Timers = {
  set: (fn, ms) => setTimeout(fn, ms),
  clear: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
};

/** 돌려주는 함수를 부르면 기다리기를 그만둔다(화면을 떠날 때) */
export function whenActive(
  app: AppStateLike,
  run: () => void,
  timers: Timers = defaultTimers,
  waitMs: number = ACTIVE_WAIT_MS,
): () => void {
  // `unknown`은 상태를 못 읽은 것이다. 기다리면 영영 안 켜질 수 있어 지금처럼 곧바로 간다
  if (app.currentState === 'active' || app.currentState === 'unknown') {
    run();
    return () => {};
  }
  let done = false;
  let timer: unknown = null;
  const finish = () => {
    done = true;
    sub.remove();
    if (timer !== null) timers.clear(timer);
    timer = null;
  };
  const go = () => {
    if (done) return;
    finish();
    run();
  };
  const sub = app.addEventListener('change', (state) => {
    if (state === 'active') go();
  });
  timer = timers.set(() => {
    timer = null;
    // 백그라운드면 계속 기다린다 — 돌아와 `active`가 오면 그때 켠다
    if (app.currentState !== 'background') go();
  }, waitMs);
  return () => {
    if (!done) finish();
  };
}
