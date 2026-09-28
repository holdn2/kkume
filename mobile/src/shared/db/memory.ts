import {
  afterIso,
  newId,
  nowIso,
  type Dream,
  type DreamDraft,
  type DreamPatch,
  type DreamRepo,
  type ListOptions,
  type SentVersion,
  type ServerDream,
  toMillisIso,
} from './types';

/**
 * 메모리 구현.
 *
 * `expo-sqlite`는 네이티브 모듈이라 지금 폰에 깔린 dev 빌드에 없다.
 * 그것 때문에 저장 로직과 화면 검증을 빌드 이후로 미루면,
 * **빌드 한 번에 확인할 것이 너무 많이 쌓인다**(EAS 무료는 플랫폼당 월 15회다).
 *
 * 그래서 같은 인터페이스를 메모리로 한 벌 만들어 둔다.
 * 앱을 끄면 사라지므로 **실제 저장의 대체물이 아니다** — 화면과 흐름을 지금 보기 위한 것이다.
 */
export function createMemoryRepo(): DreamRepo {
  let rows: Dream[] = [];
  let settings: Record<string, string> = {};

  return {
    async init() {},

    async create(draft: DreamDraft) {
      const ts = nowIso();
      const d: Dream = {
        id: newId(),
        userId: null,
        recordedAt: draft.recordedAt ?? ts,
        title: draft.title ?? null,
        text: draft.text ?? null,
        audioPath: draft.audioPath ?? null,
        durationMs: draft.durationMs ?? null,
        sttStatus: draft.sttStatus ?? 'pending',
        reviewedAt: null,
        emotion: null,
        keywords: null,
        characters: null,
        createdAt: ts,
        updatedAt: ts,
        deletedAt: null,
        syncedAt: null,
        audioUploadedAt: null,
      };
      rows = [d, ...rows];
      return d;
    },

    async update(id: string, patch: DreamPatch) {
      const i = rows.findIndex((r) => r.id === id);
      if (i < 0) return null;
      // 직전 버전보다 반드시 뒤인 시각 — SQLite 구현과 같다(afterIso 주석)
      const next = { ...rows[i], ...patch, updatedAt: afterIso(nowIso(), rows[i].updatedAt, rows[i].syncedAt) };
      rows = [...rows.slice(0, i), next, ...rows.slice(i + 1)];
      return next;
    },

    async get(id: string) {
      return rows.find((r) => r.id === id) ?? null;
    },

    async list(options: ListOptions = {}) {
      const { includeDeleted = false, limit, offset = 0 } = options;
      const filtered = rows
        .filter((r) => includeDeleted || !r.deletedAt)
        .sort((a, b) => b.recordedAt.localeCompare(a.recordedAt));
      return filtered.slice(offset, limit == null ? undefined : offset + limit);
    },

    async softDelete(id: string) {
      // 지우는 것도 서버에 가야 하는 변경이라 update 와 같은 시각 규칙을 쓴다
      rows = rows.map((r) => {
        if (r.id !== id) return r;
        const ts = afterIso(nowIso(), r.updatedAt, r.syncedAt);
        return { ...r, deletedAt: ts, updatedAt: ts };
      });
    },

    async clear() {
      rows = [];
      settings = {};
    },

    async listUnsynced(limit = 100) {
      return rows
        .filter((r) => !r.syncedAt || r.updatedAt > r.syncedAt)
        .sort((a, b) => a.updatedAt.localeCompare(b.updatedAt))
        .slice(0, limit);
    },

    async markSynced(sent: SentVersion[]) {
      // SQLite 구현과 같은 규칙이다 — 보낸 그 버전일 때만, 보낸 updatedAt으로
      const byId = new Map(sent.map((v) => [v.id, v.updatedAt]));
      rows = rows.map((r) => {
        const v = byId.get(r.id);
        return v !== undefined && r.updatedAt === v ? { ...r, syncedAt: v } : r;
      });
    },

    async upsertFromServer(d: ServerDream) {
      const version = toMillisIso(d.clientUpdatedAt);
      // 날짜 칸도 기기 모양으로 맞춘다. SQLite 구현과 같다(재현 테스트 F)
      const fields = {
        recordedAt: toMillisIso(d.recordedAt),
        title: d.title,
        text: d.text,
        durationMs: d.durationMs,
        reviewedAt: d.reviewedAt == null ? null : toMillisIso(d.reviewedAt),
        deletedAt: d.deletedAt == null ? null : toMillisIso(d.deletedAt),
        updatedAt: version,
        syncedAt: version,
      };
      const found = rows.find((r) => r.id === d.id);
      if (found) {
        // 로컬이 깨끗하거나, 서버 쪽 버전이 로컬 수정보다 늦을 때만 덮는다.
        // SQLite 구현의 WHERE와 같다. audioPath와 sttStatus는 그대로 둔다.
        // 이유는 DreamRepo에 적어 뒀다
        const clean = found.syncedAt != null && found.updatedAt <= found.syncedAt;
        const serverNewer = version > found.updatedAt;
        if (!clean && !serverNewer) return;
        rows = rows.map((r) => (r.id === d.id ? { ...r, ...fields } : r));
        return;
      }
      rows = [
        ...rows,
        {
          id: d.id,
          createdAt: d.createdAt,
          ...fields,
          userId: null,
          audioPath: null,
          sttStatus: 'pending',
          emotion: null,
          keywords: null,
          characters: null,
          audioUploadedAt: null,
        },
      ];
    },

    async listAudioPending(limit = 3) {
      return rows
        .filter(
          (r) =>
            r.audioPath != null &&
            r.durationMs != null &&
            r.deletedAt == null &&
            r.syncedAt != null &&
            r.audioUploadedAt == null,
        )
        .sort((a, b) => a.recordedAt.localeCompare(b.recordedAt))
        .slice(0, limit);
    },

    async markAudioUploaded(id: string, at: string) {
      rows = rows.map((r) => (r.id === id ? { ...r, audioUploadedAt: at } : r));
    },

    async setAudioPath(id: string, path: string) {
      // updatedAt 은 그대로 둔다. 서버로 올릴 변경이 아니다(DreamRepo 주석)
      rows = rows.map((r) => (r.id === id ? { ...r, audioPath: path } : r));
    },

    async setSttStatus(id: string, status: Dream['sttStatus']) {
      // updatedAt 은 그대로 둔다. 서버로 올릴 변경이 아니다(DreamRepo 주석)
      rows = rows.map((r) => (r.id === id ? { ...r, sttStatus: status } : r));
    },

    async getSetting(key: string) {
      return settings[key] ?? null;
    },

    async setSetting(key: string, value: string) {
      settings = { ...settings, [key]: value };
    },
  };
}
