/**
 * 커뮤니티 — 화면과 서버 사이의 계약. **서버 계약 056 확정본으로 배포됐다(2026-09-30, 서버 #60 · PR #61).**
 *
 * 화면은 이 인터페이스만 본다. 진짜 구현은 `./communityHttp`, 규칙 테스트용 가짜는
 * `@features/community/fake`다. 처음에는 가짜로 화면을 먼저 만들었다. 여기 있는 필드는 **화면이 실제로 쓰는 것만**이고,
 * 이 파일이 그대로 서버에 보낼 계약 요청의 근거가 된다 — 계획서만 보고 서버 API 를 먼저
 * 제안하지 않는다(기상 시각 API 가 쓰이지도 않은 채 폐기돼 있었던 일).
 *
 * 사용자가 정한 것(2026-09-24):
 * - **게시글은 게시할 때 꿈 내용을 복사한다.** 꿈 기록을 고치거나 지워도 올린 글은 그대로다.
 *   꿈 기록 자체는 비공개로 남는다
 * - **녹음은 올리지 않는다.** 글과 만화만 공유한다
 * - **댓글은 답글까지 한 단계.** 댓글에 답글을 달 수 있고, 답글에는 다시 달 수 없다(에브리타임 방식)
 *
 * 계획서가 정한 것(001 커뮤니티 최소 운영 장치 · 003 COM-1~6):
 * - 신고 누적 3회면 자동으로 가려진다 — 서버 몫. 가려진 글 · 댓글은 목록에 안 내려온다
 * - (폐기) 차단은 앱에서 거른다 — 056에서 서버가 거르는 것으로 바뀌었다(`blocks` 참고)
 *
 * **2026-09-29 사용자 결정(문서 055)으로 성격이 "해몽 요청"에서 "꿈 공유"로 바뀌었다** —
 * *"기록 상세에서 해몽 요청하기 보다 꿈 공유하기 이런느낌으로 가고 싶은데."* 해몽은 댓글에서 자유롭게.
 * - 올리기 전에 꿈 제목 · 내용을 고칠 수 있다(원래 기록은 그대로). 한마디(`body`)는 선택
 * - **같은 꿈은 한 번만 공유한다.** 지우면 다시 공유할 수 있다. 공유했는지는 폰이 아니라 서버에 묻는다 —
 *   앱을 지우거나 기기를 바꾸면 폰의 기억은 사라진다(`postForDream`)
 * - 피드는 최신순 · 공감 많은 순. 화면의 「공감」은 필드 이름으로는 like 다(서버와 맞출 때 정한다)
 */

/** 피드 · 사용자 글 목록의 정렬 */
export type FeedSort = 'latest' | 'empathy';

export type Author = {
  id: string;
  /** 서버가 가입 때 붙이는 닉네임(`잠꾸러기 3847`). 실명이 아니다 */
  nickname: string;
};

/** 피드 · 프로필의 글 한 줄 */
export type PostSummary = {
  id: string;
  author: Author;
  /** 꿈 제목(복사본). 없으면 본문 첫 줄로 물러선다 */
  title: string | null;
  /** 공유한 꿈 내용의 앞부분. 목록에서 두 줄까지 보인다 */
  excerpt: string;
  /** 꿈을 꾼(기록한) 시각 — 복사할 때 함께 가져온다 */
  dreamRecordedAt: string;
  /** 만화가 붙었는가. 만화는 아직 없어서 늘 false 다 */
  hasComic: boolean;
  likeCount: number;
  commentCount: number;
  likedByMe: boolean;
  createdAt: string;
  /**
   * 신고가 쌓여 가려진 **내** 글일 때만 true(서버 계약 056 04장 2). 남에게는 목록에서 빠지고 상세가 404 다.
   * 작성자에게 보이는 이유 — 꿈당 한 글이라, 숨기면 같은 꿈을 다시 올릴 때 409 가 가리키는 글을 열 수 없다.
   * 가려진 글은 공감 · 댓글을 받지 않는다(작성자 포함 404)
   */
  hidden: boolean;
};

/** 댓글. `parentId` 가 있으면 답글이다 — 답글의 답글은 없다 */
export type Comment = {
  id: string;
  postId: string;
  parentId: string | null;
  author: Author;
  body: string;
  createdAt: string;
  /** 지운 댓글에 답글이 달려 있으면 자리를 남긴다("삭제된 댓글입니다") */
  deleted: boolean;
};

export type PostDetail = PostSummary & {
  /** 게시할 때 복사한 꿈 본문 */
  dreamText: string;
  /** 올린 사람의 한마디. 없으면 빈 문자열 */
  body: string;
  /** 만화 이미지 주소. 만화가 붙기 전에는 null */
  comicUrl: string | null;
  /** 시간순. 답글은 부모 바로 뒤에 온다 — 화면이 순서를 다시 맞추지 않게 서버가 정렬해 준다 */
  comments: Comment[];
};

export type Profile = {
  id: string;
  nickname: string;
  joinedAt: string;
  postCount: number;
};

export type ReportReason = 'sexual' | 'violence' | 'spam' | 'other';

export type ReportTarget = { type: 'post' | 'comment'; id: string };

export type Page<T> = {
  items: T[];
  /** 다음 쪽이 없으면 null. 동기화처럼 불투명한 커서 하나로 둔다 */
  nextCursor: string | null;
};

export type NewPost = {
  /** 어느 꿈에서 왔는가. 서버는 소유만 확인하고 내용은 아래 복사본을 쓴다 */
  dreamId: string;
  /** 사용자가 올리기 전에 고친 제목 · 꿈 내용 — 원래 기록과 다를 수 있다 */
  title: string | null;
  dreamText: string;
  dreamRecordedAt: string;
  /** 한마디. 선택이라 빈 문자열이어도 된다 */
  body: string;
};

/**
 * 화면이 부르는 전부. 실패하면 `ApiError`(`@shared/api/client`)와 같은 모양
 * `{ code, message, status }` 를 던진다.
 */
export interface CommunityApi {
  feed(sort: FeedSort, cursor?: string | null): Promise<Page<PostSummary>>;
  post(id: string): Promise<PostDetail | null>;
  /** 이미 공유한 꿈이면 `409 already_shared` 를 던지고, 오류에 그 글의 `postId` 가 붙는다 */
  createPost(input: NewPost): Promise<PostSummary>;
  /** 이 꿈을 공유한 (지우지 않은) 내 글. 없으면 null — 꿈 상세의 「공유한 글 보기」가 쓴다 */
  postForDream(dreamId: string): Promise<string | null>;
  deletePost(id: string): Promise<void>;
  /** 누르면 뒤집는다. 서버가 센 최신 값을 돌려준다 */
  setLiked(postId: string, liked: boolean): Promise<{ likeCount: number; likedByMe: boolean }>;
  /** `parentId` 가 답글이면 `reply_depth` 로 거절한다 */
  addComment(postId: string, body: string, parentId?: string | null): Promise<Comment>;
  deleteComment(id: string): Promise<void>;
  /** 같은 사람이 같은 대상을 두 번 신고해도 한 번으로 센다 */
  report(target: ReportTarget, reason: ReportReason): Promise<void>;
  profile(userId: string): Promise<Profile | null>;
  /** 프로필 · 사용자 글은 차단한 사람이어도 거르지 않는다 — 일부러 찾아 들어간 경우다(056 04장 1) */
  userPosts(userId: string, sort: FeedSort, cursor?: string | null): Promise<Page<PostSummary>>;
  /**
   * 차단은 **서버에** 둔다(056 04장 1) — 앱을 지우면 사라지고, 앱에서 거르면 쪽이 비어 온다.
   * 서버가 피드와 글 상세의 댓글을 거른다(답글 달린 댓글은 자리만). 한쪽 방향이고 상대에게 알리지 않는다
   */
  blocks(): Promise<Author[]>;
  /** 나를 차단하면 `400 self_block` */
  block(userId: string): Promise<void>;
  unblock(userId: string): Promise<void>;
  /**
   * 닉네임 바꾸기(`PATCH /api/me`, 056 04장 4). 앞뒤 공백을 잘라 2~16자, 줄바꿈 · 제어문자는
   * `400 nickname_invalid`. 중복 허용. 글에 복사하지 않아 지난 글 · 댓글의 이름도 바뀐다
   */
  setNickname(nickname: string): Promise<Author>;
}

export const NICKNAME_MIN = 2;
export const NICKNAME_MAX = 16;

/** 서버와 같은 상한. 제목은 동기화의 제목 상한과 같게 둔다 */
export const MAX_POST_BODY = 2_000;
/**
 * 공유 편집칸의 꿈 내용 상한. 꿈 기록 본문 상한(`MAX_TEXT_LENGTH`)과 같게 두고, 받아쓰기로 더 길어진
 * 꿈은 화면이 연 시점 길이까지 연다. 서버는 20,000자까지 받는다(056 가안, 057에서 수용)
 */
export const MAX_POST_DREAM_TEXT = 5_000;
export const MAX_COMMENT = 500;
