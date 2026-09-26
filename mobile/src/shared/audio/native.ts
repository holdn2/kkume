import {
  createAudioPlayer,
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
  useAudioRecorder,
} from 'expo-audio';
import { useCallback, useEffect, useState } from 'react';

import { dbToLevel, type Player, type Recorder, type RecordingResult } from './types';

/**
 * **이 파일은 네이티브 모듈이 있을 때만 require된다.** `expo-audio`는 import되는
 * 순간 `requireNativeModule('ExpoAudio')`를 부르므로, 모듈이 없는 빌드에서
 * 이 파일을 읽으면 앱이 통째로 죽는다. 판별은 `index.ts`가 한다.
 */

// 프리셋에는 metering이 꺼져 있다. 파형에 쓸 값이 이것뿐이라 켜 준다.
//
// **녹음 파일은 document 폴더에 만든다.** 기본값 `cache`는 iOS가 공간이 부족하면 지울 수 있는
// 곳이라(expo-audio 타입 주석), 원본 오디오가 사라진다(절대 규칙 2). 2026-09-21에 9/16 녹음
// 하나가 폰에서 사라져 있었다. 이 옵션 전에 만든 기록은 여전히 캐시에 있다 — 그 파일들은 있을 때
// 서버로 올라가고, 없으면 동기화가 file_missing 으로 건너뛴다
const OPTIONS = { ...RecordingPresets.HIGH_QUALITY, isMeteringEnabled: true, directory: 'document' as const };

/** 상태를 100ms마다 읽는다. 파형이 12칸쯤 흐르는 속도라 눈에 자연스럽다 */
const POLL_MS = 100;

export function useNativeRecorder(): Recorder {
  const rec = useAudioRecorder(OPTIONS);
  const [isRecording, setIsRecording] = useState(false);
  const [durationMs, setDurationMs] = useState(0);
  const [level, setLevel] = useState(0);

  useEffect(() => {
    if (!isRecording) return;
    const t = setInterval(() => {
      const s = rec.getStatus();
      setDurationMs(s.durationMillis ?? 0);
      setLevel(dbToLevel(s.metering));
    }, POLL_MS);
    return () => clearInterval(t);
  }, [isRecording, rec]);

  const start = useCallback(async () => {
    const perm = await requestRecordingPermissionsAsync();
    if (!perm.granted) throw new Error('마이크 권한이 없습니다');

    // iOS는 이걸 켜지 않으면 녹음 세션이 열리지 않는다.
    // 무음 스위치가 켜진 채 자는 사람이 많아 playsInSilentMode도 같이 준다
    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });

    await rec.prepareToRecordAsync();
    rec.record();
    setDurationMs(0);
    setIsRecording(true);

    // `prepareToRecordAsync()`가 파일을 먼저 만들기 때문에 여기서 이미 경로가 있다.
    // **끝나기를 기다리지 않고 지금 돌려준다** — 녹음 중에 앱이 죽으면
    // `stop()`을 못 부르고, 그러면 이 경로가 어디에도 안 남는다
    return rec.uri;
  }, [rec]);

  const stop = useCallback(async (): Promise<RecordingResult> => {
    // **길이는 멈추기 전에 읽는다.** `stop()` 뒤의 녹음기는 `durationMillis`를
    // `0`으로 돌려주는데, 0은 nullish가 아니라 `??`가 안 걸린다 —
    // 폴링해 둔 값이 대체로 있는데도 0이 그대로 저장돼 실제로 `00:00`으로 남았다.
    // 그래서 `||`다. 진짜 0ms짜리 녹음은 없고, 있어도 폴링값 역시 0이라 손해가 없다.
    const measured = rec.getStatus().durationMillis;
    await rec.stop();
    setIsRecording(false);
    setLevel(0);
    return { uri: rec.uri, durationMs: measured || durationMs };
  }, [rec, durationMs]);

  return { isRecording, durationMs, level, start, stop };
}

/**
 * 실제 재생기.
 *
 * 길이는 파일에서 읽는 것을 우선한다. 아직 안 읽혔거나(로딩 중) 못 읽는 형식이면
 * **기록에 저장해 둔 값으로 물러선다** — 목록에서 이미 보여준 길이와 상세에서 보이는 길이가
 * 다르면 사용자는 둘 중 무엇을 믿을지 판단하게 된다.
 */
export function useNativePlayer(uri: string | null, fallbackMs?: number | null): Player {
  const player = useAudioPlayer(uri ? { uri } : null, { updateInterval: 100 });
  const status = useAudioPlayerStatus(player);

  const fromFile = Math.round((status.duration ?? 0) * 1000);
  const durationMs = fromFile > 0 ? fromFile : (fallbackMs ?? 0);
  const positionMs = Math.round((status.currentTime ?? 0) * 1000);

  const toggle = useCallback(() => {
    if (status.playing) {
      player.pause();
      return;
    }
    void (async () => {
      // **재생 모드를 매번 먼저 건다.** 아무것도 안 걸면 iOS 기본값(soloAmbient)이라 무음 스위치를
      // 따른다 — 앱을 새로 켜고 녹음 없이 재생하면 소리가 안 났다(2026-09-26 기기, 스위치를 끄면 들림).
      // 녹음을 다시 듣는 화면이라 음성 메모처럼 스위치와 상관없이 들려야 한다.
      // allowsRecording 을 끄는 것은 이 화면에 녹음기가 없어서다 — 켜 두면 playAndRecord 로 남는다
      await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false }).catch(() => {});
      // 끝까지 간 뒤 다시 누르면 처음부터. seekTo를 안 부르면 그 자리에 멈춰 아무 일도 안 일어난다
      if (durationMs > 0 && positionMs >= durationMs - 200) await player.seekTo(0);
      player.play();
    })();
  }, [player, status.playing, positionMs, durationMs]);

  const seek = useCallback(
    (ratio: number) => {
      if (durationMs <= 0) return;
      void player.seekTo((durationMs * ratio) / 1000);
    },
    [player, durationMs],
  );

  return {
    playing: status.playing,
    progress: durationMs ? Math.min(1, positionMs / durationMs) : 0,
    positionMs,
    durationMs,
    toggle,
    seek,
  };
}

/**
 * 파일을 재생기로 열어 **파일이 말하는 길이**를 읽는다. 진단 화면의 녹음 점검용이다.
 *
 * 저장된 `duration_ms` 가 0 인 것과 파일 자체가 망가진 것(헤더 없음)은 목록에서 똑같이 00:00 으로
 * 보인다. 둘을 가르려면 파일을 직접 열어 봐야 한다. 못 열거나 시간 안에 안 열리면 null
 */
export async function readFileDurationMs(uri: string, timeoutMs = 3000): Promise<number | null> {
  const player = createAudioPlayer({ uri });
  try {
    const until = Date.now() + timeoutMs;
    while (Date.now() < until) {
      if (player.isLoaded && player.duration > 0) return Math.round(player.duration * 1000);
      await new Promise((r) => setTimeout(r, 100));
    }
    return null;
  } finally {
    player.remove();
  }
}
