import { requireOptionalNativeModule } from 'expo-modules-core';
import { Platform, Settings } from 'react-native';

import { pickEngine, type EngineReason } from './compose';
import { useFakeDictator } from './fake';
import type { Dictator } from './types';

export * from './types';
export { pickEngine, type EngineReason } from './compose';

/**
 * 받아쓰기 모듈이 **이 빌드에** 들어 있는가(절대 규칙 10). 이름은 소스의
 * `Name("ExpoSpeechRecognition")`(`ExpoSpeechRecognitionModule.swift:62`)에서 확인했다.
 *
 * 파일 모듈도 함께 본다 — 녹음 파일을 Documents에 두려면 그 경로가 필요하고,
 * 없으면 라이브러리 기본값인 캐시 폴더로 가 원본이 사라질 수 있다(문서 052 T1).
 */
const HAS_SPEECH =
  requireOptionalNativeModule('ExpoSpeechRecognition') != null &&
  requireOptionalNativeModule('ExponentFileSystem') != null;

/** 모듈이 없는 빌드에서 흐름을 보려고 켜는 가짜. 스토리북과 같은 방식으로 셸에서 붙인다 */
const FAKE = !HAS_SPEECH && process.env.EXPO_PUBLIC_FAKE_DICTATION === 'true';

// 모듈이 있을 때만 native.ts를 읽는다. 저 파일은 import되는 순간 네이티브 모듈을 부른다
// eslint-disable-next-line @typescript-eslint/no-require-imports
const native = HAS_SPEECH ? (require('./native') as typeof import('./native')) : null;

const useImpl: () => Dictator = native ? native.useNativeDictator : useFakeDictator;

/** 훅 순서를 지키려고 모듈이 없어도 항상 부를 수 있다 — 그때는 가짜가 돈다(쓰이지는 않는다) */
export function useDictator(): Dictator {
  return useImpl();
}

/**
 * 기기 기본 언어가 한국어인가. `supportsOnDeviceRecognition()`이 로케일 없이 만든 인식기
 * (= 기본 언어)를 보기 때문에, 이게 한국어일 때만 그 답을 한국어 답으로 믿을 수 있다(052 T3).
 * `Settings`는 RN 코어의 iOS API라 새 네이티브 모듈이 필요 없다
 */
function deviceLanguageIsKorean(): boolean {
  if (Platform.OS !== 'ios') return false;
  // `Settings`는 처음 읽을 때 `TurboModuleRegistry.getEnforcing('SettingsManager')`로 모듈을 붙잡아
  // 없으면 던진다. 기본 파드(React-RCTSettings)라 있어야 하지만, 여기서 죽으면 녹음 화면이 통째로
  // 안 열린다 — 못 읽으면 Intl로, 그것도 안 되면 "한국어 아님"으로 떨어져 녹음만 한다(안전한 쪽)
  let first: string | undefined;
  try {
    first = (Settings.get('AppleLanguages') as string[] | undefined)?.[0];
  } catch {
    first = undefined;
  }
  try {
    first ??= Intl.DateTimeFormat().resolvedOptions().locale;
  } catch {
    return false;
  }
  return (first ?? '').toLowerCase().startsWith('ko');
}

export type EngineChoice = { engine: 'dictation' | 'audio'; reason: EngineReason };

/**
 * 이번 녹음에 쓸 녹음기. **권한은 조회만 한다** — 없으면 받아쓰기 없이 녹음만(절대 규칙 7).
 * 판정이 실패하면 지금의 녹음기로 간다. 녹음이 안 되는 것보다 받아쓰기가 빠지는 쪽이 낫다
 */
export async function chooseEngine(): Promise<EngineChoice> {
  if (FAKE) return { engine: 'dictation', reason: 'ok' };
  if (!native) return pickEngine({ hasModule: false, speechGranted: false, micGranted: false, localeKo: false, onDevice: false });
  try {
    const { speech, mic } = await native.readPermissions();
    return pickEngine({
      hasModule: true,
      speechGranted: speech.granted,
      micGranted: mic.granted,
      localeKo: deviceLanguageIsKorean(),
      onDevice: native.supportsOnDevice(),
    });
  } catch {
    return { engine: 'audio', reason: 'module' };
  }
}

export type SpeechPermission = 'granted' | 'undetermined' | 'denied' | 'unavailable';

/** 꿈 로그 탭의 카드를 띄울지 정한다. 묻지 않는다 */
export async function speechPermission(): Promise<SpeechPermission> {
  if (!native) return 'unavailable';
  try {
    const { speech } = await native.readPermissions();
    if (speech.granted) return 'granted';
    return speech.canAskAgain && speech.status === 'undetermined' ? 'undetermined' : 'denied';
  } catch {
    return 'unavailable';
  }
}

/** **낮 화면에서만** 부른다 — 온보딩 리허설 · 꿈 로그 탭의 카드. 시스템 창이 뜬다 */
export async function askSpeechPermission(): Promise<boolean> {
  if (!native) return false;
  try {
    return await native.askSpeechPermission();
  } catch {
    return false;
  }
}

const REASON: Record<EngineReason, string> = {
  ok: '받아쓰기',
  module: '녹음만 — 받아쓰기 모듈 없음',
  'speech-permission': '녹음만 — 음성 인식 권한 없음',
  'mic-permission': '녹음만 — 마이크 권한 없음',
  locale: '녹음만 — 기기 언어가 한국어가 아님',
  'on-device': '녹음만 — 기기 안 인식을 못 하는 기기',
};

/** 진단 화면 한 줄. 받아쓰기가 안 됐을 때 이유를 추측하지 않게 */
export async function dictationDiagnosis(): Promise<string> {
  const c = await chooseEngine();
  return `녹음기 · ${REASON[c.reason]}${FAKE ? ' (가짜)' : ''}`;
}
