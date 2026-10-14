/**
 * 녹음을 켜는 때(`whenActive`) — 앱이 완전히 앞에 나온 뒤에 한 번만 켠다(이슈 #125).
 *
 * 위젯으로 들어오면 `inactive`에서 화면이 열린다. 앱 상태와 타이머는 손으로 돌린다.
 */
import { ACTIVE_WAIT_MS, whenActive } from '@shared/audio/whenActive';

function rig(initial) {
  const listeners = new Set();
  let timers = [];
  const app = {
    currentState: initial,
    addEventListener(_type, fn) {
      listeners.add(fn);
      return { remove: () => listeners.delete(fn) };
    },
  };
  const t = {
    set: (fn, ms) => {
      const h = { fn, ms };
      timers.push(h);
      return h;
    },
    clear: (h) => {
      timers = timers.filter((x) => x !== h);
    },
  };
  let runs = 0;
  const cancel = whenActive(app, () => (runs += 1), t);
  return {
    runs: () => runs,
    listeners: () => listeners.size,
    timers: () => timers.length,
    cancel,
    change(state) {
      app.currentState = state;
      [...listeners].forEach((fn) => fn(state));
    },
    /** 상태 이벤트 없이 currentState 만 바뀐 경우(늦게 반영) */
    set(state) {
      app.currentState = state;
    },
    fire() {
      const due = timers;
      timers = [];
      due.forEach((h) => h.fn());
    },
  };
}

export const activeCases = [
  {
    key: 'A1',
    title: '이미 앞이면 곧바로 켠다 — 빠른 기록 탭에서 들어올 때는 지금과 같다',
    run: () => {
      const r = rig('active');
      return { got: [r.runs(), r.listeners(), r.timers()], want: [1, 0, 0] };
    },
  },
  {
    key: 'A2',
    title: '앞으로 나오는 중(inactive)에는 켜지 않고, active 가 오면 한 번만 켠다',
    run: () => {
      const r = rig('inactive');
      const before = r.runs();
      r.change('active');
      r.change('inactive');
      r.change('active');
      r.fire();
      return { got: [before, r.runs(), r.listeners(), r.timers()], want: [0, 1, 0, 0] };
    },
  },
  {
    key: 'A3',
    title: '기다리는 중에 background 가 와도 켜지 않는다 — 돌아와 active 가 되면 그때 켠다',
    run: () => {
      const r = rig('inactive');
      r.change('background');
      const mid = r.runs();
      r.change('active');
      return { got: [mid, r.runs()], want: [0, 1] };
    },
  },
  {
    key: 'A4',
    title: `active 이벤트가 끝내 안 오면 ${ACTIVE_WAIT_MS}ms 뒤에 켠다 — 녹음이 아예 안 켜지는 것보다 낫다`,
    run: () => {
      const r = rig('inactive');
      r.fire();
      r.change('active');
      return { got: [r.runs(), r.listeners()], want: [1, 0] };
    },
  },
  {
    key: 'A5',
    title: '시간이 다 됐어도 background 면 켜지 않고 계속 기다린다',
    run: () => {
      const r = rig('inactive');
      r.set('background');
      r.fire();
      const mid = r.runs();
      r.change('active');
      return { got: [mid, r.runs()], want: [0, 1] };
    },
  },
  {
    key: 'A6',
    title: '화면을 떠나면 기다리기를 그만둔다 — 그 뒤 active 가 와도 켜지 않는다',
    run: () => {
      const r = rig('inactive');
      r.cancel();
      r.change('active');
      r.fire();
      return { got: [r.runs(), r.listeners(), r.timers()], want: [0, 0, 0] };
    },
  },
  {
    key: 'A7',
    title: '상태를 못 읽었으면(unknown) 지금처럼 곧바로 켠다',
    run: () => {
      const r = rig('unknown');
      return { got: [r.runs()], want: [1] };
    },
  },
];
