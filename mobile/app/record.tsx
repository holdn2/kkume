import { useLocalSearchParams, useRouter } from 'expo-router';
import { Mic, PenLine, X } from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AppState,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';

import { Input, Row, Screen } from '@components';
import { Waveform } from '@features/record/Waveform';
import { MAX_TEXT_LENGTH } from '@shared/api/sync';
import { mmss, useRecorder } from '@shared/audio';
import { getDreamRepo, type DreamPatch } from '@shared/db';
import { chooseEngine, useDictator, type DictationEnd, type DictationHandlers } from '@shared/dictation';
import { savedFeedback, startFeedback } from '@shared/haptics';
import { mergeTranscript } from '@shared/stt/merge';
import { AppText } from '@shared/ui';
import { c, hit, r, sp } from '@theme/token';

type Mode = 'voice' | 'text';

/** 입력이 이만큼 멈추면 저장한다. 짧으면 타이핑 중에 깜빡이고, 길면 불안해진다 */
const IDLE_SAVE_MS = 1200;

/** 받아쓰는 중인 구간은 이 간격까지만 저장한다. 확정 구간은 오는 즉시 저장한다 */
const INTERIM_SAVE_MS = 1000;

/** 멈춘 녹음. 받아쓰기로 남겼으면 받아쓴 글이 함께 온다 */
type Taken = { uri: string | null; durationMs: number; text?: string };

/**
 * 본문은 **항상 적은 글과 받아쓴 글을 합쳐서** 만든다 — `CLAUDE.md`의 `[녹음 변환]` 형식.
 * 적기 모드가 본문을 통째로 쓰면, 음성에서 적기로 넘어가 타이핑하는 순간 받아쓴 글이 사라진다
 * (문서 052 03장). 적은 글이 없으면 마커 없이 받아쓴 글만(사용자 결정)
 */
const body = (typed: string, dictated: string) => mergeTranscript(typed, dictated);

/**
 * RM-1. **새벽에 반쯤 자면서 보는 유일한 화면**이고, 이 앱에서 유일하게
 * 1픽셀까지 신경 쓰는 화면이다(계획서 8장).
 *
 * 잠금화면 위젯이 `kkume://record?mode=voice|text`로 여기를 연다.
 * 탭 밖에 있어서 탭바가 없다 — 탭바는 "다른 데 갈 수 있다"는 신호이고
 * 그것이 곧 결정이다(절대 규칙 7).
 *
 * **모드는 여기서 바꿀 수 있다.** 위젯 하나를 반으로 갈라 쓰기 때문에
 * 각 탭 영역이 원형 위젯 하나보다 작고, 새벽에는 반대쪽을 누르게 된다.
 * 그때 사용자가 "어떡하지"를 판단하면 그게 곧 절대 규칙 7 위반이므로,
 * **오조작을 실수가 아니라 다른 시작점으로 만든다** — 버튼 하나로 넘어가고
 * 넘어가면서 지금까지 남긴 것은 같은 기록 하나에 그대로 붙는다.
 * 그래서 이 버튼은 결정이 아니라 되돌리기다.
 */
export default function RecordModal() {
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  const router = useRouter();

  // 알 수 없는 값이 와도 음성으로 간다. 새벽에 "무엇으로 기록할까요"를 묻지 않는다
  const [resolved, setResolved] = useState<Mode>(mode === 'text' ? 'text' : 'voice');
  // 되돌리기는 한 번뿐이다. 아래 switchMode의 주석에 이유가 있다.
  // 화면용 state와 별개로 ref를 두는 이유는, state는 다음 렌더에서야 반영돼
  // **그 사이에 한 번 더 눌리기 때문**이다. 더블탭이면 전환이 두 번 돈다
  const [swapped, setSwapped] = useState(false);
  const swapping = useRef(false);

  const rec = useRecorder();
  const dict = useDictator();
  /**
   * 이번 녹음을 무엇으로 하는가. 들어올 때 정한다(`chooseEngine`) — 받아쓰기를 못 하는 기기 ·
   * 권한이 없는 폰은 지금의 녹음기(expo-audio)로 녹음만 한다. 사용자에게 묻지 않는다(절대 규칙 7).
   * 훅은 둘 다 부르고 하나만 켠다. 훅 순서를 바꿀 수 없어서다
   */
  const engine = useRef<'audio' | 'dictation' | null>(null);
  const [engineOn, setEngineOn] = useState<'audio' | 'dictation'>('audio');
  const active = engineOn === 'dictation' ? dict : rec;
  const [error, setError] = useState<string | null>(null);

  const [text, setText] = useState('');
  // 콜백 안에서 최신값을 읽으려고 ref로도 들고 있다. 받아쓰기 이벤트는 렌더와 상관없이 온다
  const typed = useRef('');
  useEffect(() => {
    typed.current = text;
  }, [text]);
  /** 지금까지 받아쓴 글. 새벽 화면에는 보여주지 않는다(2026-09-26 사용자 결정, 문서 052 06장 A) */
  const dictated = useRef('');
  // **state가 아니라 ref다.** 저장은 비동기라 두 건이 겹쳐 돌 수 있는데,
  // state로 들고 있으면 둘 다 아직 null인 값을 읽고 **각각 create를 불러
  // 기록이 두 건으로 갈라진다.** 적기 자동저장(1.2초)이 발화하는 순간
  // 되돌리기를 누르면 정확히 그렇게 된다 — 드문 조작이 아니다.
  const dreamId = useRef<string | null>(null);
  // "저장됨"을 상태로 들고 껐다 켜면 effect 안에서 setState를 하게 된다.
  // 저장된 내용을 기억해 두고 **지금 내용과 같은지로 파생**시키면 그럴 일이 없다
  const [savedText, setSavedText] = useState<string | null>(null);
  const saved = savedText !== null && savedText === text;

  // 녹음을 시작하는 effect는 persist가 정의된 뒤에 있다 — 시작하자마자
  // 파일 경로를 DB에 못 박아야 해서 persist를 참조하기 때문이다.

  /** 저장을 한 줄로 세운다. 이유는 바로 아래 persist에 있다 */
  const queue = useRef<Promise<unknown>>(Promise.resolve());

  /**
   * 멈춘 녹음을 아직 저장하지 못했으면 여기 남는다.
   *
   * `stop()`은 성공했는데 저장이 실패하면 **오디오 파일은 디스크에 있고 DB에는 없다.**
   * 그 상태에서 다시 누르면 이미 멈춘 녹음기에 `stop()`을 또 부르게 되고,
   * 그러면 파일 경로를 영영 못 꺼낸다 — 기록 유실이다(절대 규칙 1).
   * 결과를 들고 있다가 **저장만 다시 시도한다.**
   */
  const pendingAudio = useRef<Taken | null>(null);

  /** 녹음을 멈춰 결과를 얻는다. 이미 멈춰 있으면 그때 받아 둔 것을 그대로 쓴다 */
  // `from=record` — 새벽 흐름이 끝나 떨어지는 꿈 로그에는 받아쓰기 권한 카드를 띄우지 않는다.
  // 방금 녹음을 마친 화면에 누를 것을 두면 그것도 새벽의 결정이다(절대 규칙 7, 검증 레인 C 지적 3)
  const leave = useCallback(
    () => router.replace({ pathname: '/log', params: { from: 'record' } }),
    [router],
  );

  /**
   * 백그라운드에서 녹음을 마무리했다는 표시. 돌아왔을 때 목록으로 보낼지를 이걸로 정한다.
   * state가 아니라 ref인 이유는 화면을 다시 그릴 일이 없어서다 — 값이 쓰이는 곳은
   * 이벤트 콜백 안뿐이고, state로 두면 리스너가 옛 값을 잡는다
   */
  const finalizedInBg = useRef(false);

  /**
   * `abort`는 백그라운드용이다. 받아쓰기의 `stop()`은 마지막 결과를 기다린 뒤에 파일을 닫는데,
   * 그 사이에 앱이 정지되면 WAV 헤더를 못 쓴다(문서 052 T7). 받아쓴 글은 진행 중 구간까지 이미 저장했다
   */
  /**
   * **한 번 멈추기 시작하면 그 약속을 같이 쓴다.** `pendingAudio`는 멈춘 뒤에야 채워져서, 정지를 두 번
   * 누르거나 정지 직후 적기를 누르면 멈추기가 두 번 돌았다(검증 레인 C 지적 4)
   */
  const taking = useRef<Promise<Taken> | null>(null);
  /**
   * 멈추라는 요청이 한 번이라도 있었는가. 녹음기가 아직 시작하는 중에 정지 · 적기를 누르면,
   * 그 뒤에 시작이 실패해도 **녹음기로 넘어가 녹음을 새로 켜지 않는다**(검증 레인 C 지적 1)
   */
  const stopRequested = useRef(false);

  const takeAudio = useCallback(
    (kind: 'stop' | 'abort' = 'stop'): Promise<Taken> => {
      stopRequested.current = true;
      if (pendingAudio.current) return Promise.resolve(pendingAudio.current);
      if (!taking.current) {
        taking.current = (async () => {
          let out: Taken;
          if (engine.current === 'dictation') {
            // 파일이 열리기 전이면 세션이 열리는 순간 끊고 그 경로로 끝낸다(session.ts)
            const end: DictationEnd = kind === 'abort' ? await dict.abort() : await dict.stop();
            out = end;
          } else if (engine.current === 'audio') {
            out = await rec.stop();
          } else {
            // 아직 어느 녹음기로 할지도 정하지 않았다. 시작하지 않고 끝낸다
            out = { uri: null, durationMs: 0 };
          }
          pendingAudio.current = out;
          return out;
        })().finally(() => {
          taking.current = null;
        });
      }
      return taking.current;
    },
    [dict, rec],
  );

  /**
   * 지금까지 남긴 것을 같은 기록 하나에 붙인다. 없으면 만들고, 있으면 고친다.
   *
   * 모드를 넘나들어도 기록이 둘로 갈라지지 않게 하는 자리다 —
   * 갈라지면 목록에 반쪽짜리 두 건이 남고, 그건 사용자가 낮에 치워야 할 일이 된다.
   */
  const persist = useCallback(
    (patch: Pick<DreamPatch, 'text' | 'audioPath' | 'durationMs' | 'sttStatus'>) => {
      // 앞의 저장이 끝난 뒤에 시작한다. 겹쳐 돌면 id가 정해지기 전에 둘 다 create를 부른다
      const run = queue.current.then(async () => {
        const repo = await getDreamRepo();
        if (dreamId.current) {
          await repo.update(dreamId.current, patch);
          return dreamId.current;
        }
        const created = await repo.create(patch);
        dreamId.current = created.id;
        return created.id;
      });
      // 한 건이 실패해도 줄이 멈추면 그 뒤 저장이 전부 막힌다.
      // 실패는 부르는 쪽이 받고, 줄은 계속 흐르게 둔다
      queue.current = run.catch(() => {});
      return run;
    },
    [],
  );

  /** 멈춘 녹음을 기록에 붙일 조각. 받아쓴 글이 있으면 본문과 "이 폰에서 합쳤음"까지 */
  const audioPatch = useCallback((out: Taken) => {
    const patch: Pick<DreamPatch, 'text' | 'audioPath' | 'durationMs' | 'sttStatus'> = {
      durationMs: out.durationMs,
    };
    // 경로가 비어 오면 쓰지 않는다 — 시작할 때 못 박아 둔 경로를 null 로 지우면 원본을 잃는다(절대 규칙 2)
    if (out.uri) patch.audioPath = out.uri;
    if (out.text !== undefined) {
      dictated.current = out.text;
      patch.text = body(typed.current, out.text);
      // 로컬 stt_status 는 "이 폰에서 합쳤음"이다. 서버 변환 합치기(decideMerge)가 다시 손대지 않게
      if (out.text) patch.sttStatus = 'done';
    }
    return patch;
  }, []);

  /** 지금의 녹음기로 녹음만 한다. 받아쓰기를 못 하는 기기 · 권한이 없는 폰, 그리고 받아쓰기가 시작 직후 실패했을 때 */
  const startAudio = useCallback(async () => {
    engine.current = 'audio';
    setEngineOn('audio');
    const uri = await rec.start();
    startFeedback();
    // 경로를 못 받는 구현이면 그냥 넘어간다. 여기서 막으면 녹음 자체가 안 된다
    if (uri) void persist({ audioPath: uri });
  }, [rec, persist]);

  /**
   * 받아쓴 글도 절대 규칙 1이다 — **확정 구간은 오는 즉시, 진행 중 구간은 1초에 한 번까지 저장한다.**
   * 끝에 한 번만 쓰면 도중에 죽을 때 녹음은 남아도 글을 잃는다. iOS 17 이하는 끝까지 한 구간이라
   * 진행 중 구간을 안 쓰면 끝날 때까지 한 글자도 저장되지 않는다(문서 052 T8)
   */
  const lastTextSave = useRef(0);
  const textTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveDictated = useCallback(() => {
    if (textTimer.current) clearTimeout(textTimer.current);
    textTimer.current = null;
    lastTextSave.current = Date.now();
    void persist({ text: body(typed.current, dictated.current) }).catch(() => {});
  }, [persist]);

  const dictationHandlers = useCallback(
    (): DictationHandlers => ({
      onText: (t, isFinal) => {
        dictated.current = t;
        const wait = INTERIM_SAVE_MS - (Date.now() - lastTextSave.current);
        if (isFinal || wait <= 0) saveDictated();
        else if (!textTimer.current) textTimer.current = setTimeout(saveDictated, wait);
      },
      // 시작 직후 받아쓰기를 못 하는 기기로 드러났다. 같은 기록에 녹음만으로 넘어간다
      onFallback: () => {
        if (stopRequested.current) return;
        void startAudio().catch((e) => setError(String(e)));
      },
      // 멈추지 않았는데 세션이 끝났다 — 백그라운드 마무리와 똑같이 저장하고 꿈 로그로(052 06장 B).
      // 기록 하나에 파일 하나라 이어 녹음하지 않는다
      onEnded: (end) => {
        pendingAudio.current = end;
        void persist(audioPatch(end))
          .catch(() => {})
          .then(() => {
            if (AppState.currentState === 'active') {
              savedFeedback();
              leave();
            } else {
              finalizedInBg.current = true;
            }
          });
      },
    }),
    [saveDictated, startAudio, persist, audioPatch, leave],
  );

  useEffect(() => () => {
    if (textTimer.current) clearTimeout(textTimer.current);
  }, []);

  /**
   * 들어오자마자 녹음이 시작된다. 시작 버튼을 누르게 하면 그게 결정이다(절대 규칙 7).
   *
   * **시작과 동시에 파일 경로를 DB에 못 박는다.** 녹음 중에 앱이 죽으면
   * `stop()`을 부를 기회가 없어서, 파일은 디스크에 남는데 그 경로가 JS 어디에도
   * 안 남는다 — 그러면 영영 못 찾는다(절대 규칙 2). PR #13 리뷰 때 이 위험을
   * 알고도 "4주차에 같이 보겠다"고 미뤘던 자리다.
   *
   * 이때 만들어지는 행은 `audio_path`는 있고 `duration_ms`는 없다.
   * **그 조합이 곧 "끝나지 않은 녹음"**이라 따로 컬럼을 두지 않았다 —
   * 정상 종료는 `finish()`가 둘을 같이 넣기 때문에 섞이지 않는다.
   *
   * 받아쓰기가 되는 폰이면 받아쓰기로, 아니면 지금의 녹음기로. 받아쓰기가 시작부터 실패하면
   * (파일을 못 만듦 · 모델 없음) 곧바로 녹음기로 넘어간다 — 원본 없는 기록을 만들지 않는다(052 T2)
   */
  const began = useRef(false);
  useEffect(() => {
    if (resolved !== 'voice' || began.current) return;
    began.current = true;
    void (async () => {
      const choice = await chooseEngine();
      // 고르는 사이에 이미 정지 · 적기를 눌렀으면 아무것도 켜지 않는다
      if (stopRequested.current) return;
      if (choice.engine === 'dictation') {
        engine.current = 'dictation';
        setEngineOn('dictation');
        try {
          const uri = await dict.start(dictationHandlers());
          // 멈추라는 요청이 있었어도 파일은 생겼다 — 경로는 못 박는다(절대 규칙 2). 시작 햅틱만 건너뛴다
          if (!stopRequested.current) startFeedback();
          void persist({ audioPath: uri });
          return;
        } catch {
          // 아래에서 녹음기로 넘어간다. 그 사이 멈추라고 했으면 새로 켜지 않는다
          if (stopRequested.current) return;
        }
      }
      await startAudio();
    })().catch((e) => setError(String(e)));
  }, [resolved, dict, dictationHandlers, startAudio, persist]);

  /**
   * **백그라운드로 가면 녹음을 마무리한다.** 시작 시점에 경로를 못 박는 것만으로는
   * 부족하다는 것이 2026-09-07 실기기 확인에서 드러났다 — 행은 남았는데
   * **파일이 재생되지 않고 `0초`로 나왔다.**
   *
   * 녹음기는 `stop()`에서 파일 헤더를 쓴다. 그 전에 죽으면 소리 데이터는 들어 있어도
   * 재생기가 길이를 못 읽어 **못 쓰는 파일**이 된다. 경로만 살려서는 절대 규칙 2를
   * 지킨 것이 아니다.
   *
   * **이 앱은 백그라운드에서 녹음할 수 없다.** `app.json`에 `UIBackgroundModes`가
   * 없어서 iOS가 앱을 정지시킨다. 즉 **홈으로 나가기만 해도 녹음은 이미 죽는다** —
   * 스위처로 밀어 없앨 때만의 문제가 아니었다. 어차피 못 이어갈 녹음이므로
   * 떠나는 그 순간 마무리해서 **멀쩡한 파일로 남긴다.**
   *
   * `inactive`가 아니라 `background`만 본다. `inactive`는 알림창을 내리거나
   * 전화가 올 때도 오는데, 거기서 멈추면 **새벽에 알림 하나로 녹음이 끊긴다.**
   *
   * 받아쓰기면 **받아쓴 글을 먼저 저장하고 `abort`로 곧바로 닫는다.** `stop`은 마지막 결과를
   * 기다린 뒤에 파일을 닫는데, 그 사이에 앱이 정지되면 WAV 헤더를 못 쓴다(문서 052 T7)
   */
  useEffect(() => {
    if (resolved !== 'voice') return;
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'background' && active.isRecording) {
        void (async () => {
          try {
            if (engine.current === 'dictation') saveDictated();
            const out = await takeAudio('abort');
            await persist(audioPatch(out));
          } catch {
            // 여기서는 화면에 남길 수 없다 — 이미 백그라운드다.
            // 시작할 때 넣어 둔 행이 있으니 경로까지 잃지는 않는다
          }
          // 실패했어도 표시한다. 돌아왔을 때 멈춘 화면에 세워 두는 것이 더 나쁘다
          finalizedInBg.current = true;
          // pendingAudio는 비우지 않는다. 정지를 누르더라도 멈춘 녹음기에
          // stop()을 다시 부르지 않고 이 결과를 그대로 쓴다
        })();
        return;
      }

      // **돌아오면 목록으로 보낸다.** 녹음은 이미 끝났고 저장도 됐는데
      // 멈춘 녹음 화면을 그대로 보여주면, 회색 타이머와 정지 버튼 앞에서
      // "이거 눌러도 되나"를 판단하게 된다 — 그게 곧 절대 규칙 7 위반이다.
      // 이미 끝난 일을 다시 확인시키지 않는다
      if (next === 'active' && finalizedInBg.current) {
        finalizedInBg.current = false;
        savedFeedback();
        leave();
      }
    });
    return () => sub.remove();
  }, [resolved, active.isRecording, takeAudio, persist, audioPatch, saveDictated, leave]);

  /**
   * 반대쪽으로 넘어간다. 넘어가기 전에 지금 것을 먼저 붙인다 — 잃는 것이 없어야 되돌리기다.
   *
   * **한 번만 된다.** `start()`는 매번 `prepareToRecordAsync()`로 새 파일을 만들어서,
   * 음성 → 적기 → 음성으로 왕복하면 두 번째 녹음이 첫 번째 `audioPath`를 덮어쓰고
   * **첫 파일이 참조를 잃는다**(절대 규칙 1). 그리고 되돌린 뒤에 또 바꾸고 싶은 것은
   * 실수가 아니라 결정이라, 새벽 화면에 둘 이유도 없다(절대 규칙 7).
   */
  const switchMode = () => {
    if (swapping.current) return;
    swapping.current = true;
    setSwapped(true);
    void (async () => {
      try {
        if (resolved === 'voice') {
          // 녹음을 멈추고 붙인 뒤 텍스트로. 정지가 곧 저장이라 따로 확인하지 않는다
          const out = await takeAudio();
          await persist(audioPatch(out));
          pendingAudio.current = null;
          setResolved('text');
        } else {
          if (text.trim()) {
            await persist({ text: body(text, dictated.current) });
            setSavedText(text);
          }
          setResolved('voice');
        }
      } catch (e) {
        // 넘어가지 못했으면 되돌리기를 다시 열어 준다. 여기서 막아버리면
        // 잘못 눌러 들어온 화면에 갇힌 채로 나갈 길이 하나뿐이 된다
        swapping.current = false;
        setSwapped(false);
        setError(String(e));
      }
    })();
  };

  // 텍스트는 멈추면 저장한다. 저장 버튼을 두면 "저장할까 말까"가 생긴다
  useEffect(() => {
    if (resolved !== 'text' || !text.trim()) return;
    const t = setTimeout(() => {
      void (async () => {
        try {
          await persist({ text: body(text, dictated.current) });
          setSavedText(text);
          savedFeedback();
        } catch (e) {
          setError(String(e));
        }
      })();
    }, IDLE_SAVE_MS);
    return () => clearTimeout(t);
  }, [text, resolved, persist]);

  /**
   * 끝내면 **꿈로그로 보낸다.** `back()`은 들어온 곳으로 돌려보내는데,
   * 위젯으로 들어왔으면 돌아갈 곳이 없고 탭에서 들어왔으면 빠른기록으로 되돌아간다 —
   * 방금 남긴 것이 어디 갔는지 알 수 없는 자리다. 목록은 저장됐다는 증거이기도 하다.
   */
  const finish = () => {
    void (async () => {
      try {
        const out = await takeAudio();
        // 길이를 여기서 같이 넣는다. 나중에 파일에서 다시 읽으면 되지 않느냐면,
        // 목록 한 화면을 그리려고 오디오 파일 수십 개를 여는 일이 된다
        await persist(audioPatch(out));
        pendingAudio.current = null;
        savedFeedback();
        leave();
      } catch (e) {
        // 다른 실패는 삼켜도 이건 아니다. 기록 유실은 이 앱에서 유일하게
        // 용납되지 않는 실패라(절대 규칙 1) 화면에 남긴다.
        // 다만 무엇을 할지 묻지는 않는다 — 그게 새벽의 결정이 된다
        setError(String(e));
      }
    })();
  };

  /** 적던 것을 그 자리에서 마저 저장하고 나간다. 기다리는 1.2초를 건너뛴다 */
  const finishText = () => {
    void (async () => {
      try {
        if (text.trim()) {
          await persist({ text: body(text, dictated.current) });
          savedFeedback();
        }
        leave();
      } catch (e) {
        setError(String(e));
      }
    })();
  };

  if (resolved === 'text') {
    return (
      <Screen night>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={s.textBody}>
            <Row>
              <AppText size="title" weight="bold" style={{ flex: 1 }}>
                어떤 꿈이었나요
              </AppText>
              {/* 반대쪽을 눌렀을 때의 되돌리기. 적던 것은 그대로 붙고 녹음이 시작된다 */}
              {!swapped && (
              <Pressable
                onPress={switchMode}
                hitSlop={16}
                accessibilityRole="button"
                accessibilityLabel="말하기로 바꿉니다"
                style={({ pressed }) => [s.swap, pressed && { opacity: 0.7 }]}>
                <Mic size={18} strokeWidth={1.75} color={c.fgMuted} />
                <AppText size="caption" color={c.fgMuted}>
                  말하기
                </AppText>
              </Pressable>
              )}
              {/* 나갈 길이 하나는 있어야 한다. 전체화면 모달이라 쓸어내려 닫을 수도 없고,
                  이건 "취소"가 아니라 "다 적었다"이므로 절대 규칙 7에 걸리지 않는다 */}
              <Pressable
                onPress={finishText}
                hitSlop={16}
                accessibilityRole="button"
                accessibilityLabel="다 적었습니다">
                <X size={26} strokeWidth={1.75} color={c.fgMuted} />
              </Pressable>
            </Row>

            {/* 상한은 걸되 글자수는 **보여주지 않는다.** 새벽 화면에 숫자가 하나 더 붙으면
                그것도 읽을 것이 되고, 5,000자에 닿는 일은 새벽에 일어나지 않는다(절대 규칙 7) */}
            <Input
              multiline
              autoFocus
              value={text}
              onChangeText={setText}
              placeholder="기억나는 것부터"
              maxLength={MAX_TEXT_LENGTH}
            />

            <AppText size="caption" color={error ? c.danger : c.fgFaint}>
              {error ?? (saved ? '저장됨' : '나가면 저장됩니다')}
            </AppText>

            {/* 빈 자리를 누르면 키보드가 내려간다. 여러 줄 입력이라 엔터로는 못 내린다 */}
            <Pressable style={{ flex: 1 }} onPress={Keyboard.dismiss} accessible={false} />
          </View>
        </KeyboardAvoidingView>
      </Screen>
    );
  }

  return (
    <Screen night>
      <View style={s.top}>
        {/* "녹음 중"이라고 쓰지 않는다. 점 하나와 색으로 충분하고, 읽을 여력이 없다 */}
        <View style={s.dotRow}>
          {active.isRecording && <View style={s.dot} />}
          <AppText size="display" weight="bold" color={active.isRecording ? c.running : c.fgFaint}>
            {mmss(active.durationMs)}
          </AppText>
        </View>

        {/* 받아쓰는 글은 여기 보여주지 않는다 — 읽을 것 · 고치고 싶은 것이 생기면 새벽의 결정이 된다
            (2026-09-26 사용자 결정 "안 보여 줌", 문서 052 06장 A). 화면은 녹음만 할 때와 같다 */}
        <Waveform level={active.level} active={active.isRecording} />

        {!!error && (
          <AppText size="caption" color={c.danger} style={{ textAlign: 'center' }}>
            {error}
          </AppText>
        )}
      </View>

      {/* 정지 버튼은 화면 하단 1/4 지점 — 누워서 한 손으로 잡았을 때 엄지가 닿는 자리다.
          취소·삭제는 두지 않는다. 새벽에 잘못 눌러 기록이 사라지는 손실이 훨씬 크다 */}
      <View style={s.stopArea}>
        {/* 정지보다 작고 위에 둔다. 새벽에 엄지가 가는 곳은 정지 하나여야 한다 */}
        {!swapped && (
        <Pressable
          onPress={switchMode}
          hitSlop={16}
          accessibilityRole="button"
          accessibilityLabel="적기로 바꿉니다"
          style={({ pressed }) => [s.swap, s.swapAbove, pressed && { opacity: 0.7 }]}>
          <PenLine size={18} strokeWidth={1.75} color={c.fgMuted} />
          <AppText size="caption" color={c.fgMuted}>
            적기
          </AppText>
        </Pressable>
        )}

        <Pressable
          onPress={finish}
          accessibilityRole="button"
          accessibilityLabel="녹음 정지"
          style={({ pressed }) => [s.stop, pressed && { opacity: 0.7 }]}>
          <View style={s.square} />
        </Pressable>
      </View>
    </Screen>
  );
}

const s = StyleSheet.create({
  textBody: { flex: 1, gap: sp[4], paddingTop: sp[4] },
  top: { flex: 3, justifyContent: 'center', alignItems: 'center', gap: sp[6] },
  dotRow: { flexDirection: 'row', alignItems: 'center', gap: sp[3] },
  dot: { width: 10, height: 10, borderRadius: r.chip, backgroundColor: c.running },
  stopArea: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  // 되돌리기 버튼. 정지보다 작고 조용해야 한다 — 눈에 먼저 들어오면 그게 결정이 된다
  swap: { flexDirection: 'row', alignItems: 'center', gap: sp[1], minHeight: hit.min, paddingHorizontal: sp[2] },
  // 정지 버튼은 하단 1/4 지점에 못 박혀 있다(계획서 8장). 되돌리기를 흐름에 끼워 넣으면
  // 그 자리가 밀리므로 띄워서 얹는다 — 엄지가 가는 곳은 끝까지 정지 하나여야 한다
  swapAbove: { position: 'absolute', top: 0 },
  stop: {
    width: hit.stop,
    height: hit.stop,
    borderRadius: r.chip,
    backgroundColor: c.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  square: { width: 26, height: 26, borderRadius: 6, backgroundColor: c.fg },
});
