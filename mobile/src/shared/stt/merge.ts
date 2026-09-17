import type { SttStatus } from '@shared/db';

/**
 * 녹음 변환문을 본문에 합친다 — `CLAUDE.md`의 "STT 결과는 `text` 하나에 쓴다".
 *
 * **합치는 자리는 앱 하나다**(문서 039 · 040). 서버는 `text`를 쓰지 않고 변환 원문만 준다.
 * 서버가 쓰면 변환하는 동안 사용자가 고친 글과 부딪혀 둘 중 하나가 사라진다.
 * 앱은 자기 로컬 본문의 최신본 위에 합치고, 결과를 기기 시각으로 올린다.
 *
 * 모양은 이렇다.
 *
 * ```
 * 사용자가 적기로 남긴 내용
 *
 * [녹음 변환]
 * STT로 변환한 내용
 * ```
 */
export const TRANSCRIPT_MARKER = '[녹음 변환]';

const SEPARATOR = `\n\n${TRANSCRIPT_MARKER}\n`;

const escaped = TRANSCRIPT_MARKER.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** **줄 하나를 통째로 차지할 때만** 마커로 본다. 사용자가 문장 가운데 쓴 같은 글자는 본문이다 */
const MARKER_LINE = new RegExp(`(^|\\n)${escaped}\\n`);

/** 마커 줄 바로 뒤의 위치. 마커가 없으면 -1 */
function afterMarker(text: string): number {
  const m = MARKER_LINE.exec(text);
  return m ? m.index + m[0].length : -1;
}

/**
 * 본문에 변환문을 합친 결과를 돌려준다. 저장은 부르는 쪽이 한다.
 *
 * - **덮어쓰지 않는다.** 사용자가 적은 글이 있으면 그 아래에 마커와 함께 이어 쓴다(절대 규칙 1)
 * - **음성만 남긴 기록에는 마커를 붙이지 않는다**(사용자 결정). 위에 적은 글이 없으면 가를 것이 없다
 * - **마커가 있으면 그 아래를 통째로 갈아 끼운다.** 이어 붙이면 재시도마다 같은 문장이 쌓인다
 * - **마커를 찾을 수 없으면 맨 뒤에 붙인다.** 사용자가 지우거나 옮겼을 수 있고, 중복이 유실보다 낫다
 * - **길이로 자르지 않는다**(039 C5). 본문 5,000자 상한은 키보드 입력에만 건다 —
 *   잘라 넣으면 사용자가 말한 것이 조용히 사라진다
 * - 변환문이 비어 있으면 본문을 그대로 둔다
 */
export function mergeTranscript(text: string | null, transcript: string): string {
  const body = text ?? '';
  const incoming = transcript.trim();
  if (!incoming) return body;
  if (!body.trim()) return incoming;

  const at = afterMarker(body);
  if (at >= 0) return body.slice(0, at) + incoming;
  return body.trimEnd() + SEPARATOR + incoming;
}

export type MergeDecision = 'merge' | 'mark-done' | 'skip';

/**
 * 받기에서 이 기록의 변환문을 합칠지 정한다(문서 039 C3 · C4).
 *
 * **로컬 `stt_status`는 "이 폰에서 합쳤음"이고, 서버 `sttStatus`는 "합칠 것이 생겼다"는 신호다.**
 * 둘은 다른 사실이다. 그래서 받기에서 행을 덮었는지와 상관없이 따로 본다 —
 * 안 올린 수정이 있어 행을 덮지 않았어도 변환은 끝났을 수 있다.
 *
 * - 서버 `audioUrl`이 없으면 음성이 없거나 아직 안 올린 기록이라 `sttStatus`는 뜻이 없다
 * - 서버 변환이 끝나지 않았으면(`pending` · `failed`) 기다린다
 * - **이 폰에서 이미 합쳤으면 다시 합치지 않는다.** 사용자가 변환문을 고쳐 뒀을 수 있다
 * - **받은 본문에 마커가 이미 있으면 다른 기기가 합친 것**이라 합치지 않고 `done`만 표시한다(C4 완화).
 *   **음성만 남긴 기록은 마커가 없어 이 방법으로 못 알아챈다** — 기기가 둘이면 한 번 더 합쳐질 수 있다.
 *   1인 1기기 전제(사용자 결정)라 알려진 한계로 둔다
 */
export function decideMerge(input: {
  audioUrl: string | null;
  serverSttStatus: string;
  localSttStatus: SttStatus;
  serverText: string | null;
}): MergeDecision {
  if (input.audioUrl == null) return 'skip';
  if (input.serverSttStatus !== 'done') return 'skip';
  if (input.localSttStatus === 'done') return 'skip';
  if (input.serverText != null && afterMarker(input.serverText) >= 0) return 'mark-done';
  return 'merge';
}
