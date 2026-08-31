/**
 * expo-haptics는 네이티브 모듈이라 dev client 빌드에 포함돼 있어야 동작한다.
 * 지금 폰에 깔린 빌드는 이 패키지를 넣기 전에 만든 것이어서 조용히 안 울린다.
 * 재빌드 이후에는 코드를 고치지 않아도 저절로 동작한다.
 *
 * 세기를 나누는 이유는 계획서 7.7이 **패턴으로 의미를 구분**하기 때문이다 —
 * 녹음 시작은 Medium 1회("지금부터 말하세요", 가장 중요한 신호),
 * 정지·저장 완료는 Light 2회("잡았습니다"), 텍스트 자동 저장은 Light 1회.
 * 새벽에는 화면을 못 보므로 이 구분이 유일한 피드백이 된다.
 */
type Style = 'light' | 'medium';

let impact: ((style: Style) => Promise<unknown>) | null | undefined;

function load() {
  if (impact !== undefined) return;
  try {
    // 지연 require — 모듈이 없어도 여기서만 실패한다
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const H = require('expo-haptics');
    impact = (style: Style) =>
      H.impactAsync(style === 'medium' ? H.ImpactFeedbackStyle.Medium : H.ImpactFeedbackStyle.Light);
  } catch {
    impact = null;
  }
}

function fire(style: Style) {
  load();
  if (!impact) return;
  try {
    // impactAsync는 Promise를 돌려준다. 네이티브 모듈이 빠진 빌드에서는
    // 동기 throw가 아니라 **rejection**으로 실패하므로 try/catch로는 못 잡는다.
    // catch를 안 붙이면 누를 때마다 "Uncaught (in promise)"가 뜬다.
    void impact(style)?.catch(() => {
      impact = null; // 한 번 실패하면 다시 시도하지 않는다
    });
  } catch {
    impact = null;
  }
}

/** 누름 확인. 되돌리기 어려운 액션에만 준다 — 남발하면 신호가 죽는다 */
export function tapFeedback() {
  fire('light');
}

/** "지금부터 말하세요" — 녹음이 실제로 시작된 순간에만 */
export function startFeedback() {
  fire('medium');
}

/** "잡았습니다" — 정지·저장 완료. 두 번이라 시작과 헷갈리지 않는다 */
export function savedFeedback() {
  fire('light');
  setTimeout(() => fire('light'), 90);
}
