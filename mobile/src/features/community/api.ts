import type { CommunityApi } from '@shared/api/community';
import { createHttpCommunity } from '@shared/api/communityHttp';
import { isExpired, loadSession } from '@shared/auth/session';

/**
 * 커뮤니티 화면이 쓰는 서버의 문 하나. 화면은 `CommunityApi` 인터페이스만 본다.
 *
 * **2026-09-30부터 진짜 서버가 답한다**(서버 이슈 #60 · PR #61). 그 전에 화면을 만들던 가짜 서버
 * (`./fake`)는 규칙 테스트(`scripts/community`)가 계속 쓴다 — 서버 테스트와 이름을 맞춰 둔 기준이다.
 * 만료된 토큰은 넘기지 않는다: 서버는 보낸 토큰이 맞아야 해서 붙이면 읽기까지 401 이 된다(056).
 */
const http = createHttpCommunity({
  token: async () => {
    const s = await loadSession();
    return s && !isExpired(s) ? s.accessToken : null;
  },
});

export function getCommunityApi(): CommunityApi {
  return http;
}
