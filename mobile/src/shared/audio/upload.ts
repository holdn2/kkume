import { requireOptionalNativeModule } from 'expo-modules-core';

/**
 * 녹음 파일을 서버가 준 자리(presigned URL)로 올린다.
 *
 * **올린 뒤에도 폰의 원본은 지우지 않는다**(절대 규칙 2). S3 는 사본이다.
 *
 * `expo-file-system` 은 `package.json` 에 없고 `expo` 를 따라 들어와 있다.
 * 자동 링크로 빌드에 들어가지만 **있는지는 기기에서만 확정된다**(절대 규칙 10).
 * 업로드 함수(`uploadAsync`)가 있는 쪽은 옛 API 라 그 모듈 이름(`ExponentFileSystem`)으로 묻는다.
 * 2026-09-17 진단 화면에서 설치된 빌드에 둘 다 들어 있는 것을 확인했다.
 */
const HAS_FILE_SYSTEM = requireOptionalNativeModule('ExponentFileSystem') != null;

export function uploadBackend(): 'expo-file-system' | 'none' {
  return HAS_FILE_SYSTEM ? 'expo-file-system' : 'none';
}

function legacy() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('expo-file-system/legacy');
}

/** 없거나 읽을 수 없으면 `null`. 크기를 못 재는 것으로 업로드를 막지는 않는다 */
export async function fileSize(path: string): Promise<number | null> {
  if (!HAS_FILE_SYSTEM) return null;
  try {
    const info = await legacy().getInfoAsync(path);
    return info?.exists ? ((info.size as number | undefined) ?? null) : null;
  } catch {
    return null;
  }
}

export type PutResult = { status: number; body: string };

/**
 * 파일 바이트를 그대로 PUT 한다.
 *
 * **`headers` 를 그대로 붙인다.** `Content-Type` 이 서명에 들어가 있어서 다르면
 * S3 가 `403 SignatureDoesNotMatch` 로 거절한다(서버 README).
 * 던지지 않고 상태 코드와 본문을 돌려준다 — 막혔을 때 응답 전문이 필요하다.
 */
export async function putFile(
  uploadUrl: string,
  filePath: string,
  headers: Record<string, string>,
): Promise<PutResult> {
  if (!HAS_FILE_SYSTEM) throw new Error('이 빌드에는 파일 업로드 모듈이 없습니다');
  const fs = legacy();
  const res = await fs.uploadAsync(uploadUrl, filePath, {
    httpMethod: 'PUT',
    uploadType: fs.FileSystemUploadType.BINARY_CONTENT,
    headers,
  });
  return { status: res.status as number, body: typeof res.body === 'string' ? res.body : '' };
}
