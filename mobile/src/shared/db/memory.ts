import {
  newId,
  nowIso,
  type Dream,
  type DreamDraft,
  type DreamPatch,
  type DreamRepo,
  type ListOptions,
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
        emotion: null,
        keywords: null,
        characters: null,
        createdAt: ts,
        updatedAt: ts,
        deletedAt: null,
        syncedAt: null,
      };
      rows = [d, ...rows];
      return d;
    },

    async update(id: string, patch: DreamPatch) {
      const i = rows.findIndex((r) => r.id === id);
      if (i < 0) return null;
      const next = { ...rows[i], ...patch, updatedAt: nowIso() };
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
      const ts = nowIso();
      rows = rows.map((r) => (r.id === id ? { ...r, deletedAt: ts, updatedAt: ts } : r));
    },

    async clear() {
      rows = [];
      settings = {};
    },

    async getSetting(key: string) {
      return settings[key] ?? null;
    },

    async setSetting(key: string, value: string) {
      settings = { ...settings, [key]: value };
    },
  };
}
