/**
 * `@shared/audio/upload` 의 대역. 진짜 것은 `expo-file-system` 으로 파일을 PUT 하므로 Node 에서 못 돈다.
 *
 * 가짜 서버가 발급한 URL 의 key 를 "S3"(fake-server 의 `s3` Map)에 넣는다.
 * **`Content-Type` 이 서명과 다르면 403** — 실제 S3 와 같은 규칙이다(문서 042).
 */
import { s3 } from './fake-server.mjs';

export const uploadControl = {
  /** 200 이 아니면 PUT 이 그 상태로 실패한다 */
  putStatus: 200,
  putCalls: 0,
};

export function resetUpload() {
  uploadControl.putStatus = 200;
  uploadControl.putCalls = 0;
  s3.clear();
}

export function uploadBackend() {
  return 'expo-file-system';
}

export async function fileSize() {
  return 1024;
}

export async function putFile(uploadUrl, filePath, headers) {
  uploadControl.putCalls += 1;
  const key = uploadUrl.replace(/^https:\/\/fake-s3\//, '').split('?')[0];
  if (headers?.['Content-Type'] !== 'audio/mp4') {
    return { status: 403, body: '<Error><Code>SignatureDoesNotMatch</Code></Error>' };
  }
  if (uploadControl.putStatus !== 200) {
    return { status: uploadControl.putStatus, body: 'fake failure' };
  }
  s3.set(key, filePath);
  return { status: 200, body: '' };
}
