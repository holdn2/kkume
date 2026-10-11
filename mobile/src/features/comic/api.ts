import type { ComicApi } from '@shared/api/comic';
import { createHttpComic } from '@shared/api/comicHttp';
import { isExpired, loadSession } from '@shared/auth/session';

/**
 * 만화 화면이 쓰는 서버의 문 하나. 화면은 `ComicApi` 인터페이스만 본다.
 *
 * **2026-10-11부터 진짜 서버가 답한다**(서버 이슈 #96 · PR #97, 문서 083). 그 전에 화면을 만들던 가짜 서버
 * (`./fake`)는 규칙 테스트(`scripts/comic`)와 스토리가 계속 쓴다 — 커뮤니티가 넘어간 방식과 같다.
 * 만료된 토큰은 넘기지 않는다: 만화 API는 전부 로그인이 필요해 HTTP 구현이 그 자리에서 401 로 막는다.
 */
const http = createHttpComic({
  token: async () => {
    const s = await loadSession();
    return s && !isExpired(s) ? s.accessToken : null;
  },
});

export function getComicApi(): ComicApi {
  return http;
}

/**
 * **처리방침 시행일(2026-10-18) 전에는 만화 진입점을 보이지 않는다.** 꺼져 있으면 꿈 상세의 「만화로 만들기」와
 * 꿈 나눔 글쓰기의 「만화 함께 올리기」가 숨는다. 화면 자체(`/comic/*`)와 스토리북 스토리는 남는다.
 *
 * 만화는 꿈 내용을 Cloudflare(미국)로 보낸다 — 처리방침 개정(PR #95)이 10-18에 시행되기 전에
 * 나간 앱에서 켜면 알리지 않은 국외 이전이 된다. 켜는 날 이 줄을 `true` 로 바꿔 OTA 한다.
 * 꺼진 자리를 "곧 나옵니다"로 보여 주면 App Store 2.1(미완성 기능)에 걸린다(문서 078)
 *
 * 개발 번들(Metro)에서만 켠다 — OTA · 빌드 번들은 `__DEV__` 가 false 라 꺼진 채 나간다
 */
export const COMIC_ENABLED = __DEV__;

/**
 * 꿈 나눔에 만화 붙이기. 서버가 `comicId` 를 받으므로(083 04절) 만화와 함께 켜고 끈다.
 * 따로 켜면 시행일 전 번들에서 글쓰기 화면이 만화 목록을 서버에 묻게 된다
 */
export const COMIC_ATTACH_ENABLED = COMIC_ENABLED;
