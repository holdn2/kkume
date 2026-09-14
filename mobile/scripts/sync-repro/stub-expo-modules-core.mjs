/** Node에는 네이티브 모듈이 없다. 저장소 · 세션 코드가 모듈을 읽을 때 부르는 것만 흉내 낸다 */
export function requireOptionalNativeModule() {
  return null;
}
