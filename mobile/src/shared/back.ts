import { useRouter, type Href } from 'expo-router';
import { useCallback } from 'react';

/**
 * 스택 화면의 뒤로 가기(이슈 #129, 문서 095 D4).
 *
 * **돌아갈 곳이 없으면 정한 화면으로 간다.** 알림 · 링크로 그 화면에 바로 들어오면 스택에 앞 화면이 없어
 * `router.back()`이 아무 일도 하지 않는다 — 뒤로 버튼이 먹통으로 보인다. 꿈 상세 · 만화만 이것을 따지고
 * 꿈 공유 · 프로필 · 차단 목록 · 글 상세는 그냥 `back()`이었다. 만화 완료 알림을 붙이면 실제로 생기는 길이다
 */
export function useBack(fallback: Href) {
  const router = useRouter();
  return useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace(fallback);
  }, [router, fallback]);
}
