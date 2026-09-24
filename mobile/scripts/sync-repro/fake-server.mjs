/**
 * 가짜 동기화 서버.
 *
 * `@shared/api/sync`를 이 파일로 바꿔 끼워 `syncOnce`가 진짜 서버 대신 이걸 부르게 한다.
 * **판정 규칙은 서버 코드를 읽고 그대로 옮겼다**(server/.../dream/SyncService.java ·
 * Dream.java · DreamRepository.java). 여기가 서버와 다르면 재현이 거짓이 된다.
 *
 * - 올리기: 검증 → 없으면 저장(saved) → 남의 것이면 rejected(not_owned) →
 *   저장된 clientUpdatedAt이 받은 updatedAt보다 **이르지 않으면** skipped → 아니면 saved
 * - 저장할 때 서버 updatedAt은 **서버 시계**, clientUpdatedAt은 **기기가 보낸 updatedAt**
 * - 받기: (updatedAt > since) 또는 (updatedAt = since 이고 id > cursor), (updatedAt, id) 순서,
 *   한 건 더 읽어 hasMore 판단, 비었으면 since · cursor를 그대로 돌려준다
 * - 시각은 마이크로초로 들고, 내보낼 때는 Java Instant처럼 0 · 3 · 6자리로 쓴다
 */

export const MAX_BATCH = 100;
const MAX_PAGE = 100;
/**
 * 지금 로그인한 계정. 서버는 토큰에서 소유자를 정하므로, 계정이 바뀌면 같은 주소가
 * 다른 사람의 기록을 답한다. **`server.setUser`로 바꾼다**(재현 테스트 G)
 */
let USER = 'u1';

const state = {
  rows: new Map(),
  skewMs: 0,
  lastMicros: 0n,
  duringPush: null,
  pullDisabled: false,
  failPullOnCall: null,
  pullCalls: 0,
  pushLog: [],
  /** 발급한 업로드 자리 수. key 를 매번 새로 만드는 데도 쓴다 */
  uploadSlots: 0,
  /** GET /stt 를 부른 횟수. pending 인 동안은 부르지 않아야 한다(재현 테스트 H) */
  sttCalls: 0,
};

/** ISO-8601 → 마이크로초(BigInt). 기기의 3자리와 서버의 6자리를 같은 눈금으로 비교하려고 */
export function parseInstant(iso) {
  const m = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,9}))?Z$/.exec(iso);
  if (!m) throw new Error(`시각 형식이 아니다: ${iso}`);
  const sec = BigInt(Date.parse(`${m[1]}Z`)) * 1000n;
  const nanos = BigInt((m[2] ?? '').padEnd(9, '0'));
  return sec + nanos / 1000n;
}

/** 마이크로초 → Java Instant.toString과 같은 모양(소수부 0 · 3 · 6자리) */
export function formatInstant(micros) {
  const ms = Number(micros / 1000n);
  const base = new Date(Math.floor(ms / 1000) * 1000).toISOString().slice(0, 19);
  const frac = micros % 1_000_000n;
  if (frac === 0n) return `${base}Z`;
  if (frac % 1000n === 0n) return `${base}.${String(frac / 1000n).padStart(3, '0')}Z`;
  return `${base}.${String(frac).padStart(6, '0')}Z`;
}

/** 서버 시계. 서버가 쓰는 시각은 대개 마이크로초 자리까지 채워져 있으므로 그렇게 흉내 낸다 */
function serverNow() {
  let m = BigInt(Date.now() + state.skewMs) * 1000n + BigInt(1 + Math.floor(Math.random() * 998));
  if (m <= state.lastMicros) m = state.lastMicros + 1n;
  state.lastMicros = m;
  return m;
}

function validate(p) {
  if (!p || !p.id) return 'missing_id';
  if (p.id.length > 64) return 'id_too_long';
  if (!p.recordedAt) return 'missing_recorded_at';
  if (!p.updatedAt) return 'missing_updated_at';
  if (p.title != null && p.title.length > 255) return 'title_too_long';
  return null;
}

function apply(row, p, now) {
  row.title = p.title;
  row.text = p.text;
  row.durationMs = p.durationMs;
  row.recordedAt = p.recordedAt;
  row.reviewedAt = p.reviewedAt;
  row.deletedAt = p.deletedAt;
  row.clientUpdatedAt = parseInstant(p.updatedAt);
  row.updatedAt = now;
}

function view(r) {
  return {
    id: r.id,
    recordedAt: r.recordedAt,
    title: r.title,
    text: r.text,
    // 업로드(④ complete)가 끝난 행만 값이 있다. sttStatus 는 audioUrl 이 있을 때만 뜻이 있다(039 04장)
    audioUrl: r.audioUrl ?? null,
    sttStatus: r.sttStatus ?? 'pending',
    durationMs: r.durationMs,
    reviewedAt: r.reviewedAt,
    deletedAt: r.deletedAt,
    createdAt: formatInstant(r.createdAt),
    updatedAt: formatInstant(r.updatedAt),
    clientUpdatedAt: formatInstant(r.clientUpdatedAt),
  };
}

export async function pushDreams(_token, dreams) {
  if (dreams.length > MAX_BATCH) {
    throw { code: 'too_many', message: `한 번에 ${MAX_BATCH}건까지`, status: 400 };
  }
  const results = [];
  for (const p of dreams) {
    const reason = validate(p);
    let status;
    if (reason) {
      results.push({ id: p?.id ?? null, status: 'rejected', reason });
      status = 'rejected';
    } else {
      const now = serverNow();
      const existing = state.rows.get(p.id);
      if (!existing) {
        const row = { id: p.id, userId: USER, createdAt: now };
        apply(row, p, now);
        state.rows.set(p.id, row);
        status = 'saved';
      } else if (existing.userId !== USER) {
        status = 'rejected';
      } else if (!(existing.clientUpdatedAt < parseInstant(p.updatedAt))) {
        status = 'skipped';
      } else {
        apply(existing, p, now);
        status = 'saved';
      }
      results.push({ id: p.id, status, reason: status === 'rejected' ? 'not_owned' : null });
    }
    state.pushLog.push({ id: p?.id, updatedAt: p?.updatedAt, title: p?.title, status });
  }
  // 서버는 이미 반영했고 응답은 아직 기기에 안 닿은 시점. 사용자가 그 사이 고치는 상황을 여기서 만든다
  if (state.duringPush) await state.duringPush();
  return { results };
}

export async function pullDreams(_token, opts = {}) {
  state.pullCalls += 1;
  if (state.failPullOnCall === state.pullCalls) {
    throw { code: 'network', message: '네트워크에 연결할 수 없습니다', status: 0 };
  }
  const since = opts.since ? parseInstant(opts.since) : 0n;
  const cursor = opts.cursor ?? null;
  if (state.pullDisabled) {
    return { dreams: [], nextSince: opts.since ?? null, nextCursor: cursor, hasMore: false };
  }
  const size = Math.min(Math.max(opts.limit ?? MAX_PAGE, 1), MAX_PAGE);
  const found = [...state.rows.values()]
    .filter((r) => r.userId === USER)
    .filter((r) => r.updatedAt > since || (r.updatedAt === since && cursor != null && r.id > cursor))
    .sort((a, b) => (a.updatedAt < b.updatedAt ? -1 : a.updatedAt > b.updatedAt ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .slice(0, size + 1);
  const hasMore = found.length > size;
  const page = hasMore ? found.slice(0, size) : found;
  if (page.length === 0) {
    return { dreams: [], nextSince: formatInstant(since), nextCursor: cursor, hasMore: false };
  }
  const last = page[page.length - 1];
  return { dreams: page.map(view), nextSince: formatInstant(last.updatedAt), nextCursor: last.id, hasMore };
}

// ---- 오디오 업로드 · 변환 상태 (문서 039 · server/README.md "오디오와 변환") ----
//
// 규칙을 README 의 오류 표 그대로 옮겼다. 여기가 서버와 다르면 재현이 거짓이 된다.
//   upload:   없음 → 404 dream_not_found · 지움 → 409 dream_deleted ·
//             duration 없음 → 409 recording_unfinished · 이미 올림 → 409 audio_exists
//   complete: 발급한 key 아님 → 400 key_mismatch · S3 에 없음 → 422 upload_missing ·
//             두 번 보내도 같은 답
//   stt:      오디오 없음 → 404 no_audio

const apiError = (status, code) => ({ code, message: `서버 ${status} ${code}`, status });

/** "S3". PUT 이 성공한 key 만 들어 있다. 가짜 업로드(fake-upload.mjs)가 넣는다 */
export const s3 = new Map();
/** 발급한 업로드 자리. dreamId → key */
const issued = new Map();

export async function requestUploadSlot(_token, dreamId) {
  const r = state.rows.get(dreamId);
  if (!r || r.userId !== USER) throw apiError(404, 'dream_not_found');
  if (r.deletedAt) throw apiError(409, 'dream_deleted');
  if (r.durationMs == null) throw apiError(409, 'recording_unfinished');
  if (r.audioUrl) throw apiError(409, 'audio_exists');
  state.uploadSlots += 1;
  const key = `audio/${USER}/${dreamId}/${state.uploadSlots}.m4a`;
  issued.set(dreamId, key);
  return {
    uploadUrl: `https://fake-s3/${key}?X-Amz-Signature=fake`,
    method: 'PUT',
    headers: { 'Content-Type': 'audio/mp4' },
    key,
    expiresAt: formatInstant(serverNow() + 15n * 60n * 1_000_000n),
  };
}

export async function completeUpload(_token, dreamId, key) {
  const r = state.rows.get(dreamId);
  if (!r || r.userId !== USER) throw apiError(404, 'dream_not_found');
  // 이미 같은 key 로 끝났으면 같은 답 — 응답이 유실돼 다시 보내는 경우
  if (r.audioUrl === `s3://fake/${key}`) return { sttStatus: r.sttStatus ?? 'pending' };
  if (issued.get(dreamId) !== key) throw apiError(400, 'key_mismatch');
  if (!s3.has(key)) throw apiError(422, 'upload_missing');
  r.audioUrl = `s3://fake/${key}`;
  r.sttStatus = 'pending';
  r.sttText = null;
  r.updatedAt = serverNow(); // 받기에 다시 내려오게
  return { sttStatus: 'pending' };
}

export async function fetchStt(_token, dreamId) {
  state.sttCalls += 1;
  const r = state.rows.get(dreamId);
  if (!r || r.userId !== USER) throw apiError(404, 'dream_not_found');
  if (!r.audioUrl) throw apiError(404, 'no_audio');
  return {
    status: r.sttStatus ?? 'pending',
    text: r.sttStatus === 'done' ? (r.sttText ?? null) : null,
    error: r.sttStatus === 'failed' ? 'no_speech' : null,
    attempts: r.sttStatus === 'pending' ? 0 : 1,
    updatedAt: formatInstant(r.updatedAt),
  };
}

/** 테스트가 서버를 조작하는 손잡이 */
export const server = {
  /** 다른 계정으로 로그인한 상황을 만든다. 서버가 그 계정으로 답하게 된다(재현 테스트 G) */
  setUser(id) {
    USER = id;
  },
  /** 변환이 끝난 것처럼 만든다. 서버는 text · clientUpdatedAt 을 안 건드리고 updatedAt 만 올린다(039) */
  finishStt(id, transcript) {
    const r = state.rows.get(id);
    r.sttStatus = 'done';
    r.sttText = transcript;
    r.updatedAt = serverNow();
  },
  failStt(id) {
    const r = state.rows.get(id);
    r.sttStatus = 'failed';
    r.updatedAt = serverNow();
  },
  /**
   * 다른 기기가 이미 올린 것처럼 audioUrl 을 채운다.
   * `bump: false` 면 updatedAt 을 안 올려 받기에 안 내려온다 — 앱이 ②에서 409 audio_exists 를 받는 경로
   */
  attachAudio(id, { bump = true } = {}) {
    const r = state.rows.get(id);
    r.audioUrl = `s3://fake/other-device/${id}.m4a`;
    r.sttStatus = 'pending';
    if (bump) r.updatedAt = serverNow();
  },
  get sttCalls() {
    return state.sttCalls;
  },
  get uploadSlots() {
    return state.uploadSlots;
  },
  reset() {
    USER = 'u1';
    issued.clear();
    s3.clear();
    state.uploadSlots = 0;
    state.sttCalls = 0;
    state.rows = new Map();
    state.skewMs = 0;
    state.lastMicros = 0n;
    state.duringPush = null;
    state.pullDisabled = false;
    state.failPullOnCall = null;
    state.pullCalls = 0;
    state.pushLog = [];
  },
  get rows() {
    return state.rows;
  },
  get pushLog() {
    return state.pushLog;
  },
  get pullCalls() {
    return state.pullCalls;
  },
  setSkew(ms) {
    state.skewMs = ms;
  },
  onPush(fn) {
    state.duringPush = fn;
  },
  disablePull(v) {
    state.pullDisabled = v;
  },
  failPullOnCall(n) {
    state.failPullOnCall = n;
  },
  /** 다른 기기가 올린 것처럼 서버의 기록을 바꾼다 */
  editAsOtherDevice(id, patch, clientUpdatedAtIso) {
    const r = state.rows.get(id);
    Object.assign(r, patch);
    r.clientUpdatedAt = parseInstant(clientUpdatedAtIso);
    r.updatedAt = serverNow();
  },
  /** 다른 기기가 올린 기록을 넣는다. at을 주면 전부 같은 서버 시각으로 박는다 */
  seed(n, { sameInstant = false, prefix = 'srv' } = {}) {
    const t = serverNow();
    for (let i = 0; i < n; i += 1) {
      const at = sameInstant ? t : serverNow();
      // clientUpdatedAt은 그 버전을 만든 **기기의** 시각이라 밀리초까지만 있다(toISOString).
      // 서버 시계(마이크로초)를 그대로 넣으면 실제로는 오지 않는 값을 시험하게 된다
      const deviceAt = (at / 1000n) * 1000n;
      const id = `${prefix}-${String(i).padStart(4, '0')}`;
      state.rows.set(id, {
        id,
        userId: USER,
        recordedAt: formatInstant(deviceAt),
        title: `서버 ${i}`,
        text: null,
        durationMs: null,
        reviewedAt: null,
        deletedAt: null,
        createdAt: at,
        updatedAt: at,
        clientUpdatedAt: deviceAt,
      });
    }
  },
};
