/**
 * 앱이 **백그라운드에서 돌아온 뒤** 잠깐 기다렸다가 한 번 부른다(이슈 #187).
 *
 * 꿈 로그 · 마이 탭은 들어올 때(포커스) 동기화를 부르는데, 그 화면을 띄운 채 앱을 내렸다가 다시 열면
 * 포커스가 다시 오지 않아 탭을 옮기기 전까지 동기화가 돌지 않았다.
 *
 * **화면이 보이는 동안만 듣는다** — 화면의 `useFocusEffect` 안에서 부르고, 떠날 때 돌려준 함수로 끊는다.
 * **곧바로 부르지 않고 기다린다** — 잠금화면 위젯으로 들어오면 앱이 앞으로 나오면서 녹음 화면이 위로 열린다.
 * 그 사이 목록 화면은 포커스를 잃어 이 기다림이 끊기므로, 새벽 기록 흐름에 동기화가 끼어들지 않는다
 * (`log/index.tsx`가 복귀에 걸지 않았던 이유). 30초 간격 · 겹침 막기는 `syncIfSignedIn`이 그대로 한다.
 *
 * `inactive`만 거친 복귀(알림 센터를 내렸다 올림 등)는 앱을 떠난 것이 아니라 세지 않는다.
 * 기다림이 끝났을 때 앱이 `active`가 아니면(그 사이 알림 센터를 내림) 부르지 않고 미뤘다가, 다시 `active`가
 * 되면 곧바로 부른다 — 그 사이 화면을 떠나면 돌려준 함수가 같이 끊는다(PR #188 리뷰).
 * RN 의 `AppState`를 모양만 받는 것은 테스트 때문이다(`scripts/foreground`).
 */
import type { AppStateLike, Timers } from '@shared/audio/whenActive';

/** 복귀하고 이만큼 기다린 뒤 부른다. 위젯 진입이면 그 안에 녹음 화면이 열려 화면을 떠난다 */
export const FOREGROUND_WAIT_MS = 3000;

const defaultTimers: Timers = {
  set: (fn, ms) => setTimeout(fn, ms),
  clear: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
};

/** 돌려주는 함수를 부르면 그만 듣고, 기다리던 것도 취소한다(화면을 떠날 때) */
export function afterForeground(
  app: AppStateLike,
  run: () => void,
  timers: Timers = defaultTimers,
  waitMs: number = FOREGROUND_WAIT_MS,
): () => void {
  let left = app.currentState === 'background';
  let timer: unknown = null;
  // 기다림은 끝났는데 앱이 앞이 아니어서 미뤄 둔 것
  let deferred = false;
  const clear = () => {
    if (timer !== null) timers.clear(timer);
    timer = null;
  };
  const sub = app.addEventListener('change', (state) => {
    if (state === 'background') {
      left = true;
      deferred = false;
      // 기다리는 사이 다시 내려가면 취소한다 — 다음 복귀에서 다시 센다
      clear();
      return;
    }
    if (state === 'active' && deferred) {
      deferred = false;
      run();
      return;
    }
    if (state !== 'active' || !left) return;
    left = false;
    clear();
    timer = timers.set(() => {
      timer = null;
      if (app.currentState !== 'active') {
        deferred = true;
        return;
      }
      run();
    }, waitMs);
  });
  return () => {
    sub.remove();
    clear();
    deferred = false;
  };
}
