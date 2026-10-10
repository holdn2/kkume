import type { ComicApi } from '@shared/api/comic';
import { isExpired, loadSession } from '@shared/auth/session';

import { createFakeComicApi } from './fake';

/**
 * 만화 화면이 쓰는 서버의 문 하나. 화면은 `ComicApi` 인터페이스만 본다.
 *
 * **아직 가짜가 답한다**(문서 081 초안, 이슈 #92). 서버 배포 알림이 오면 이 줄을 HTTP 구현으로 바꾼다 —
 * 커뮤니티가 같은 방식으로 넘어갔다(`@features/community/api`). 가짜는 앱을 끄면 비워진다.
 */
const fake = createFakeComicApi({
  me: async () => {
    const s = await loadSession();
    return s && !isExpired(s) ? s.user.id : null;
  },
});

export function getComicApi(): ComicApi {
  return fake;
}

/**
 * **서버가 붙기 전에는 만화 진입점을 보이지 않는다.** 꺼져 있으면 꿈 상세의 「만화로 만들기」와
 * 꿈 나눔 글쓰기의 「만화 함께 올리기」가 숨는다. 화면 자체(`/comic/*`)와 스토리북 스토리는 남는다.
 *
 * 켜기 전에 할 것(문서 081 05장): 서버 배포 · 처리방침에 모델 제공자를 넣고 7일 전 알림.
 * 꺼진 자리를 "곧 나옵니다"로 보여 주면 App Store 2.1(미완성 기능)에 걸린다(문서 078)
 *
 * 개발 번들(Metro)에서만 켠다 — OTA · 빌드 번들은 `__DEV__` 가 false 라 꺼진 채 나간다
 */
export const COMIC_ENABLED = __DEV__;

/**
 * **꿈 나눔에 만화 붙이기는 따로 켠다.** 만화 만들기는 가짜 서버가 답하지만, 글 올리기는 개발 번들에서도
 * **진짜 서버**로 나간다. 서버는 아직 `comicId` 를 모르므로 실어 보내면 조용히 버려지고, 사용자는
 * 붙였다고 믿은 채 만화 없는 글이 올라간다(PR #93 리뷰). 서버가 문서 081 03장을 받으면 켠다
 */
export const COMIC_ATTACH_ENABLED = false;
