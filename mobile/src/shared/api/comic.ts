/**
 * 꿈 만화 서버 계약(문서 081, 서버의 답 083). 화면은 이 인터페이스만 본다 — 진짜 서버는 `./comicHttp`,
 * 규칙 테스트와 스토리는 가짜(`@features/comic/fake`)를 쓴다. 고르는 곳은 `@features/comic/api` 하나다.
 *
 * - AI 호출은 서버만 한다(절대 규칙 6). 앱은 만들기를 부탁하고 상태를 읽는다(폴링)
 * - **그림에는 글자가 없다.** 컷마다 해설 · 대사를 따로 받아 앱이 얹는다 — 이미지 안의 한글은 깨지기 쉽다
 * - **그림 방식은 서버가 정한다**(`layout`). 앱은 2×2 한 장과 4장 따로를 둘 다 그린다 —
 *   모델을 바꿔도 앱 OTA가 필요 없다
 */

/** 그림체. 이름은 중립적으로 — 특정 작가 · 작품을 떠올리게 하지 않는다(계획서 003 CM-1) */
export type ComicStyle = 'soft' | 'ink';

export type ComicStatus = 'queued' | 'scripting' | 'drawing' | 'done' | 'failed' | 'refused';

/** `grid2x2` 는 네 컷이 한 장에 그려져 온다(`imageUrls` 1개). `panels4` 는 컷마다 한 장(4개) */
export type ComicLayout = 'grid2x2' | 'panels4';

export type ComicPanel = {
  /** 컷 아래 해설. 비어 있을 수 있다 */
  caption: string;
  /** 인물의 말. 없으면 null — 말풍선을 그리지 않는다 */
  dialogue: string | null;
};

export type Comic = {
  id: string;
  dreamId: string;
  style: ComicStyle;
  status: ComicStatus;
  /** `done` 일 때만 있다 */
  layout: ComicLayout | null;
  /**
   * 짧게 살아 있는 주소다. **저장하지 않는다** — 열 때마다 다시 받는다.
   * 가짜 서버는 빈 배열을 주고 화면은 그 자리에 자리 그림을 그린다
   */
  imageUrls: string[];
  /** 4개. 시나리오가 끝나면(`drawing` 부터) 채워진다 */
  panels: ComicPanel[];
  /** `failed` · `refused` 일 때 그대로 보여 줄 문구 */
  failMessage: string | null;
  createdAt: string;
  finishedAt: string | null;
};

export type NewComic = {
  dreamId: string;
  /** 만들 때의 복사본 — 꿈 나눔과 같다. 동기화가 됐는지와 상관없이 만들 수 있다 */
  title: string | null;
  dreamText: string;
  style: ComicStyle;
};

/**
 * 실패하면 `ApiError`(`@shared/api/client`)와 같은 `{ code, message, status }` 를 던진다.
 *
 * | code | status | 뜻 |
 * |---|---|---|
 * | `invalid_comic_input` | 400 | 본문이 비었거나 너무 김, 모르는 그림체 |
 * | `comic_in_progress` | 409 | 만드는 중인 만화가 이미 있다. 오류에 `comicId` 가 붙는다 |
 * | `comic_daily_limit` | 429 | 오늘 몫(1편)을 다 썼거나, 거절 · 실패까지 센 시도가 하루 5회다. 오류에 `resetAt` 이 붙는다 |
 * | `comic_budget_exhausted` | 503 | 오늘 서비스 전체 몫(50편)이 끝났거나 Cloudflare 무료 한도를 다 썼다 |
 * | `comic_unavailable` | 503 | 서버에 모델 키나 저장소가 없다(로컬 서버). 운영에서는 나오지 않는다 |
 *
 * 화면은 서버 문구(`message`)를 그대로 보여 준다 — 코드마다 문구를 앱에 따로 두지 않는다.
 */
export interface ComicApi {
  create(input: NewComic): Promise<Comic>;
  get(id: string): Promise<Comic | null>;
  /** 이 꿈으로 만든 내 만화, 최신순 */
  forDream(dreamId: string): Promise<Comic[]>;
  remove(id: string): Promise<void>;
}

/** 꿈 나눔과 같은 상한 — 서버는 20,000자까지 받는다(081 01장) */
export const MAX_COMIC_DREAM_TEXT = 20_000;
export const COMIC_PANELS = 4;
/** 만드는 중 상태를 다시 묻는 간격 */
export const COMIC_POLL_MS = 2_000;

/** 아직 끝나지 않은 상태 — 폴링을 계속한다 */
export function isComicRunning(s: ComicStatus): boolean {
  return s === 'queued' || s === 'scripting' || s === 'drawing';
}
