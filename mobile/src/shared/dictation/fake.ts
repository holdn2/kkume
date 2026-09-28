import { useCallback, useEffect, useRef, useState } from 'react';

import { applyResult, dictatedText, EMPTY_DICTATION, settle, type DictationState } from './compose';
import type { DictationEnd, DictationHandlers, Dictator } from './types';

/**
 * 모듈이 없는 빌드에서 받아쓰기 흐름을 보는 가짜. `EXPO_PUBLIC_FAKE_DICTATION=true`일 때만 쓴다.
 *
 * **진짜 라이브러리가 보내는 순서를 흉내 낸다** — 진행 중 구간이 자라다 확정되고, 두 번째 구간부터
 * 앞에 공백이 붙고, 멈추면 마지막 구간을 한 번 더 확정으로 보낸다(iOS 18, 문서 052 T8).
 * 저장 시점 · 되돌리기 · 백그라운드 마무리를 빌드 없이 확인하려는 것이다.
 * 파일은 만들지 않지만 경로는 준다 — 스킴을 `fake:`로 둬 진짜 파일과 헷갈리지 않게 한다.
 */
const SCRIPT = ['바다 위를 걸었다', '고래가 나를 봤다', '물이 따뜻했다', '깨어나기 직전에 누가 불렀다'];
const FAKE_URI = 'fake://받아쓰기-녹음-없음.wav';
const TICK_MS = 700;

export function useFakeDictator(): Dictator {
  const [isRecording, setIsRecording] = useState(false);
  const [durationMs, setDurationMs] = useState(0);
  const [level, setLevel] = useState(0);
  const state = useRef<DictationState>(EMPTY_DICTATION);
  const handlers = useRef<DictationHandlers | null>(null);
  const started = useRef(0);

  useEffect(() => {
    if (!isRecording) return;
    let sentence = 0;
    let words = 0;
    const t = setInterval(() => {
      setDurationMs(Date.now() - started.current);
      setLevel(Math.random() * 0.8);
      const all = SCRIPT[sentence % SCRIPT.length].split(' ');
      words += 1;
      const lead = sentence > 0 ? ' ' : '';
      const isFinal = words >= all.length;
      state.current = applyResult(state.current, isFinal, lead + all.slice(0, words).join(' '));
      handlers.current?.onText(dictatedText(state.current), isFinal);
      if (isFinal) {
        sentence += 1;
        words = 0;
      }
    }, TICK_MS);
    return () => clearInterval(t);
  }, [isRecording]);

  const end = useCallback((): DictationEnd => {
    state.current = settle(state.current);
    setIsRecording(false);
    setLevel(0);
    return { uri: FAKE_URI, durationMs: Date.now() - started.current, text: dictatedText(state.current) };
  }, []);

  const start = useCallback(async (h: DictationHandlers) => {
    handlers.current = h;
    state.current = EMPTY_DICTATION;
    started.current = Date.now();
    setDurationMs(0);
    setIsRecording(true);
    return FAKE_URI;
  }, []);

  const stop = useCallback(async () => {
    // 끝의 되풀이 확정 — 진짜와 같이 한 번 더 보낸다. 합치기가 거르는지 화면에서도 보인다
    const last = state.current.committed[state.current.committed.length - 1];
    if (last) state.current = applyResult(state.current, true, ` ${last}`);
    return end();
  }, [end]);

  const abort = useCallback(async () => end(), [end]);

  return { isRecording, durationMs, level, start, stop, abort };
}
