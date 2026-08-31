/**
 * expo-haptics는 네이티브 모듈이라 dev client 빌드에 포함돼 있어야 동작한다.
 * 지금 폰에 깔린 빌드는 이 패키지를 넣기 전에 만든 것이어서,
 * 모듈 스코프에서 import하면 `requireNativeModule`이 던지고 앱이 통째로 죽는다.
 *
 * 재빌드는 3주차에 네이티브 변경을 모아 한 번만 한다(빌드 예산).
 * 그때까지는 햅틱이 조용히 안 울릴 뿐이고, 그 사이에 앱이 멈추지는 않는다.
 * 재빌드 이후에는 코드를 고치지 않아도 저절로 동작한다.
 */
let impact: (() => Promise<unknown>) | null | undefined;

export function tapFeedback() {
  if (impact === null) return; // 이미 없다고 확인된 경우
  if (impact === undefined) {
    try {
      // 지연 require — 모듈이 없어도 여기서만 실패한다
      const H = require('expo-haptics');
      impact = () => H.impactAsync(H.ImpactFeedbackStyle.Light);
    } catch {
      impact = null;
      return;
    }
  }
  try {
    // impactAsync는 Promise를 돌려준다. 네이티브 모듈이 빠진 빌드에서는
    // 동기 throw가 아니라 **rejection**으로 실패하므로 try/catch로는 못 잡는다.
    // catch를 안 붙이면 버튼을 누를 때마다 "Uncaught (in promise)"가 뜬다.
    void impact?.()?.catch(() => {
      impact = null; // 한 번 실패하면 다시 시도하지 않는다
    });
  } catch {
    impact = null;
  }
}
