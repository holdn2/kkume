import type { ApiError } from '@shared/api/client';
import {
  COMIC_PANELS,
  MAX_COMIC_DREAM_TEXT,
  type Comic,
  type ComicApi,
  type ComicPanel,
  type ComicStatus,
  type NewComic,
} from '@shared/api/comic';

/**
 * 가짜 만화 서버 — 서버가 붙기 전 화면을 만들 때 썼고, 지금은 규칙 테스트(`scripts/comic`)와 스토리가 쓴다.
 * 진짜 서버(문서 083)와 같은 규칙 · 문구로 답한다.
 *
 * **상태는 저장하지 않고 시각으로 계산한다.** 만든 시각에서 얼마나 지났는지로
 * `queued → scripting → drawing → done` 을 정하므로, 화면이 폴링하면 실제처럼 단계가 넘어가고
 * 테스트는 `now` 를 옮겨 단계를 바로 본다.
 *
 * 꿈 내용에 `[거절]` 이 있으면 `refused`, `[실패]` 가 있으면 `failed` 로 끝난다 — 화면에서 그 상태를
 * 만들어 보려고 둔 장치다. 둘 다 하루 몫에서 빠진다(081 02장).
 */
export type FakeComicOptions = {
  now?: () => number;
  /** 로그인한 사람. null 이면 401 */
  me?: () => Promise<string | null>;
  /** 1인 하루 몫(081 01장, 1편). 거절 · 실패는 세지 않는다 */
  dailyLimit?: number;
  /** 1인 하루 시도(083 01장, 5회). 거절 · 실패 · 지운 것까지 센다 — 거절을 되풀이해 서비스 몫을 혼자 쓰지 못하게 */
  dailyAttempts?: number;
  /** 오늘 서비스 전체 몫이 끝난 상태를 흉내 낸다 */
  budgetExhausted?: () => boolean;
  /** 단계마다 걸리는 시간 */
  stepMs?: { queued: number; scripting: number; drawing: number };
};

type Row = { comic: Comic; owner: string; startedAt: number; text: string; deleted: boolean };

const DEFAULT_STEPS = { queued: 800, scripting: 2_500, drawing: 5_000 };
const DAY_MS = 24 * 60 * 60 * 1000;
const KST_MS = 9 * 60 * 60 * 1000;

function err(code: string, status: number, message: string, extra: Record<string, unknown> = {}): ApiError {
  return { code, status, message, data: { code, message, ...extra } } as ApiError;
}

/** KST 자정 기준 날짜 번호 */
function kstDay(ms: number): number {
  return Math.floor((ms + KST_MS) / DAY_MS);
}

/** 꿈 본문을 문장으로 잘라 네 컷 해설로 나눈다. 진짜 서버는 언어 모델이 쓴다 */
export function fakePanels(text: string): ComicPanel[] {
  const sentences = text
    .replace(/\[(거절|실패)\]/g, '')
    .split(/(?<=[.!?。…])\s+|\n+/)
    .map((x) => x.trim())
    .filter(Boolean);
  const per = Math.max(1, Math.ceil(sentences.length / COMIC_PANELS));
  return Array.from({ length: COMIC_PANELS }, (_, i) => ({
    caption: sentences.slice(i * per, (i + 1) * per).join(' ') || '…',
    dialogue: null,
  }));
}

export function createFakeComicApi(opts: FakeComicOptions = {}): ComicApi {
  const now = opts.now ?? Date.now;
  const me = opts.me ?? (async () => 'me');
  const limit = opts.dailyLimit ?? 1;
  const attempts = opts.dailyAttempts ?? 5;
  const steps = opts.stepMs ?? DEFAULT_STEPS;
  const rows = new Map<string, Row>();
  let seq = 0;

  function statusAt(row: Row, t: number): ComicStatus {
    const e = t - row.startedAt;
    if (e < steps.queued) return 'queued';
    if (e < steps.queued + steps.scripting) return 'scripting';
    if (row.text.includes('[거절]')) return 'refused';
    if (e < steps.queued + steps.scripting + steps.drawing) return 'drawing';
    if (row.text.includes('[실패]')) return 'failed';
    return 'done';
  }

  function view(row: Row): Comic {
    const t = now();
    const status = statusAt(row, t);
    const scripted = status === 'drawing' || status === 'done' || status === 'failed';
    const ended = status === 'done' || status === 'failed' || status === 'refused';
    return {
      ...row.comic,
      status,
      layout: status === 'done' ? 'grid2x2' : null,
      panels: scripted ? fakePanels(row.text) : [],
      failMessage:
        status === 'refused'
          ? '이 꿈은 만화로 만들 수 없어요. 다른 꿈으로 만들어 보세요.'
          : status === 'failed'
            ? '만화를 만들지 못했습니다. 잠시 뒤 다시 만들어 주세요.'
            : null,
      // 끝난 시각은 한 번 정해지면 그대로다 — 읽은 시각을 쓰면 읽을 때마다 바뀐다(PR #93 리뷰).
      // 거절은 시나리오 단계 끝에, 나머지는 그림 단계 끝에 끝난다
      finishedAt: ended
        ? new Date(
            row.startedAt +
              steps.queued +
              steps.scripting +
              (status === 'refused' ? 0 : steps.drawing),
          ).toISOString()
        : null,
    };
  }

  async function owner(): Promise<string> {
    const id = await me();
    if (!id) throw err('unauthorized', 401, '로그인이 필요합니다');
    return id;
  }

  return {
    async create(input: NewComic) {
      const who = await owner();
      const text = input.dreamText.trim();
      if (!text || text.length > MAX_COMIC_DREAM_TEXT || (input.style !== 'soft' && input.style !== 'ink')) {
        throw err('invalid_comic_input', 400, '만화로 만들 꿈 내용을 확인해 주세요');
      }
      const mine = [...rows.values()].filter((r) => r.owner === who && !r.deleted);
      const running = mine.find((r) => {
        const s = statusAt(r, now());
        return s === 'queued' || s === 'scripting' || s === 'drawing';
      });
      if (running) {
        throw err('comic_in_progress', 409, '만들고 있는 만화가 있어요', { comicId: running.comic.id });
      }
      if (opts.budgetExhausted?.()) {
        throw err('comic_budget_exhausted', 503, '오늘 만화가 마감됐어요. 내일 다시 만들어 주세요');
      }
      const today = kstDay(now());
      const todays = [...rows.values()].filter((r) => r.owner === who && kstDay(r.startedAt) === today);
      // 거절 · 실패는 몫에서 뺀다 — 사용자 탓이 아니다(081 02장). 지운 것은 센다 — 지워서 몫을 되살리지 못하게.
      // 다만 시도는 전부 센다(083) — 둘 중 하나라도 넘으면 같은 429
      const used = todays.filter((r) => {
        const s = statusAt(r, now());
        return s !== 'failed' && s !== 'refused';
      }).length;
      if (used >= limit || todays.length >= attempts) {
        const resetAt = new Date((today + 1) * DAY_MS - KST_MS).toISOString();
        throw err('comic_daily_limit', 429, '오늘 만들 수 있는 만화를 다 만들었어요. 내일 다시 만들어 주세요', {
          resetAt,
        });
      }
      const t = now();
      const id = `comic-${++seq}`;
      const comic: Comic = {
        id,
        dreamId: input.dreamId,
        style: input.style,
        status: 'queued',
        layout: null,
        imageUrls: [],
        panels: [],
        failMessage: null,
        createdAt: new Date(t).toISOString(),
        finishedAt: null,
      };
      const row = { comic, owner: who, startedAt: t, text, deleted: false };
      rows.set(id, row);
      return view(row);
    },
    async get(id) {
      const who = await owner();
      const row = rows.get(id);
      return row && row.owner === who && !row.deleted ? view(row) : null;
    },
    async forDream(dreamId) {
      const who = await owner();
      return [...rows.values()]
        .filter((r) => r.owner === who && !r.deleted && r.comic.dreamId === dreamId)
        .sort((a, b) => b.startedAt - a.startedAt)
        .map(view);
    },
    async remove(id) {
      const who = await owner();
      const row = rows.get(id);
      if (row && row.owner === who) row.deleted = true;
    },
  };
}
