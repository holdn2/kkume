import type { AudioFormat } from '@shared/api/audio';

/**
 * 업로드 자리를 받을 때 알릴 녹음 형식(서버 #52 · PR #53).
 *
 * 받아쓰기 녹음은 WAV로만 남는다 — 인식 라이브러리가 WAV밖에 못 쓴다(문서 048).
 * 옛 녹음(m4a)은 **형식을 보내지 않는다.** 본문이 없으면 서버가 m4a로 본다 — 형식을 안 보내던
 * 앱과 같은 길이라 지금 폰의 동작이 그대로다. WAV를 형식 없이 보내면 키가 `.m4a` · `audio/mp4`로
 * 서명돼 **오류 없이** 형식이 어긋난 채 올라간다(재현 테스트 H11).
 *
 * `@shared/api/audio`가 아니라 여기 두는 이유: 동기화 재현 도구가 그 모듈을 가짜 서버로 바꿔 끼워서,
 * 거기 두면 테스트가 이 규칙을 못 본다.
 */
export function uploadFormatFor(audioPath: string): AudioFormat | undefined {
  return /\.wav$/i.test(audioPath) ? 'wav' : undefined;
}
