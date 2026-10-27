import { requireOptionalNativeModule } from 'expo-modules-core';
import type { RefObject } from 'react';
import { NativeModules, TurboModuleRegistry, type View } from 'react-native';

/**
 * 만화를 사진 보관함에 저장한다(계획서 003 CM-3 「저장 / 공유」, 이슈 #151).
 *
 * **그림 파일이 아니라 화면에 보이는 네 컷을 찍어 저장한다.** 말풍선은 서버 그림이 아니라 앱이 그 위에 얹는다(문서 081) —
 * 그림만 저장하면 대사가 빠진 만화가 된다. 그래서 `react-native-view-shot`으로 그 영역을 찍고 `expo-media-library`로 넣는다.
 *
 * 모듈은 있을 때만 부른다(절대 규칙 10). 둘 다 이 빌드(#151)에서 처음 들어왔다 — 옛 빌드에서는 버튼을 숨긴다.
 * - `expo-media-library`는 Expo 모듈이라 `requireOptionalNativeModule`로 묻는다. SDK 57은 새 API(`ExpoMediaLibraryNext`)가
 *   기본이고 옛 `saveToLibraryAsync`는 부르면 던진다 — `Asset.create`를 쓴다
 * - `react-native-view-shot`은 Expo 모듈이 아니다. 안에서 `getEnforcing`으로 읽어 없으면 던지므로
 *   던지지 않는 `TurboModuleRegistry.get`으로 묻는다(구글 로그인과 같은 방식)
 */
export const CAN_SAVE_COMIC =
  requireOptionalNativeModule('ExpoMediaLibraryNext') != null &&
  (TurboModuleRegistry.get('RNViewShot') != null || NativeModules.RNViewShot != null);

export type SaveResult = 'saved' | 'denied' | 'failed';

/** `target`이 가리키는 화면 영역을 PNG로 찍어 사진 보관함에 넣는다. 권한은 「추가만」 묻는다 */
export async function saveComicImage(target: RefObject<View | null>): Promise<SaveResult> {
  if (!CAN_SAVE_COMIC || !target.current) return 'failed';
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Media = require('expo-media-library') as typeof import('expo-media-library');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { captureRef } = require('react-native-view-shot') as typeof import('react-native-view-shot');
  try {
    // 추가만 묻는다. Android 13+는 쓰기만이면 권한 창 없이 통과한다(MediaStore에 넣기만 함 — `app.json`에서 읽기 권한을 막음)
    const perm = await Media.requestPermissionsAsync(true);
    if (!perm.granted) return 'denied';
    const uri = await captureRef(target, { format: 'png', result: 'tmpfile' });
    await Media.Asset.create(uri);
    return 'saved';
  } catch (e) {
    // 기기에서만 나는 실패다 — 어느 단계였는지 로그로 남긴다(빌드가 귀해 원인을 못 보면 다시 재기 어렵다, 이슈 #151 리뷰)
    console.warn('[comic save]', e);
    return 'failed';
  }
}
