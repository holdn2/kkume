/**
 * 앱으로 돌아오면 잠깐 기다렸다 한 번 동기화한다(`afterForeground`, 이슈 #187).
 *
 * 앱 상태와 타이머는 손으로 돌린다. `fire()`는 기다리던 타이머를 지금 끝낸다.
 */
import { afterForeground, FOREGROUND_WAIT_MS } from '@shared/sync/foreground';

function rig(initial = 'active') {
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
  const stop = afterForeground(app, () => (runs += 1), t);
  return {
    runs: () => runs,
    listeners: () => listeners.size,
    timers: () => timers.length,
    waits: () => timers.map((h) => h.ms),
    stop,
    go(...states) {
      for (const s of states) {
        app.currentState = s;
        [...listeners].forEach((fn) => fn(s));
      }
    },
    fire() {
      const due = timers;
      timers = [];
      due.forEach((h) => h.fn());
    },
  };
}

const cases = [
  {
    key: 'F1',
    title: '붙이는 순간에는 부르지 않는다 — 들어올 때 동기화는 화면의 포커스가 이미 한다',
    run: () => {
      const r = rig('active');
      return { got: [r.runs(), r.timers(), r.listeners()], want: [0, 0, 1] };
    },
  },
  {
    key: 'F2',
    title: '내렸다 열면 곧바로가 아니라 기다린 뒤 한 번 부른다',
    run: () => {
      const r = rig('active');
      r.go('inactive', 'background', 'inactive', 'active');
      const before = r.runs();
      const waits = r.waits();
      r.fire();
      return { got: [before, waits, r.runs()], want: [0, [FOREGROUND_WAIT_MS], 1] };
    },
  },
  {
    key: 'F3',
    title: '위젯 진입 — 기다리는 사이 녹음 화면이 열려 화면을 떠나면 부르지 않는다',
    run: () => {
      const r = rig('active');
      r.go('background', 'inactive', 'active');
      r.stop();
      r.fire();
      return { got: [r.runs(), r.timers(), r.listeners()], want: [0, 0, 0] };
    },
  },
  {
    key: 'F4',
    title: 'inactive 만 거친 복귀(알림 센터 내렸다 올림)는 앱을 떠난 것이 아니라 부르지 않는다',
    run: () => {
      const r = rig('active');
      r.go('inactive', 'active');
      r.fire();
      return { got: [r.runs(), r.timers()], want: [0, 0] };
    },
  },
  {
    key: 'F5',
    title: '기다리는 사이 다시 내려가면 취소하고, 다음 복귀에서 다시 센다',
    run: () => {
      const r = rig('active');
      r.go('background', 'active', 'background');
      const afterDown = r.timers();
      r.go('active');
      r.fire();
      return { got: [afterDown, r.runs()], want: [0, 1] };
    },
  },
  {
    key: 'F6',
    title: '복귀가 여러 번이면 그때마다 한 번씩 — 30초 간격은 syncIfSignedIn 이 막는다',
    run: () => {
      const r = rig('active');
      r.go('background', 'active');
      r.fire();
      r.go('background', 'active');
      r.fire();
      return { got: r.runs(), want: 2 };
    },
  },
  {
    key: 'F7',
    title: '백그라운드 상태에서 붙었으면(화면이 뒤에서 포커스) 첫 active 도 복귀로 센다',
    run: () => {
      const r = rig('background');
      r.go('active');
      r.fire();
      return { got: r.runs(), want: 1 };
    },
  },
  {
    key: 'F8',
    title: 'active 가 두 번 와도(이벤트 중복) 한 번만 기다린다',
    run: () => {
      const r = rig('active');
      r.go('background', 'active', 'active');
      const n = r.timers();
      r.fire();
      return { got: [n, r.runs()], want: [1, 1] };
    },
  },
];

let failed = 0;
for (const c of cases) {
  let got;
  let want;
  let error = null;
  try {
    ({ got, want } = await c.run());
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
