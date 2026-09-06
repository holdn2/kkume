import { useLocalSearchParams, useRouter } from 'expo-router';
import { Mic, PenLine, X } from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Keyboard, KeyboardAvoidingView, Platform, Pressable, StyleSheet, View } from 'react-native';

import { Input, Row, Screen } from '@components';
import { Waveform } from '@features/record/Waveform';
import { mmss, useRecorder, type RecordingResult } from '@shared/audio';
import { getDreamRepo } from '@shared/db';
import { savedFeedback, startFeedback } from '@shared/haptics';
import { AppText } from '@shared/ui';
import { c, hit, r, sp } from '@theme/token';

type Mode = 'voice' | 'text';

/** 입력이 이만큼 멈추면 저장한다. 짧으면 타이핑 중에 깜빡이고, 길면 불안해진다 */
const IDLE_SAVE_MS = 1200;

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
  const { start, stop } = rec;
  const [error, setError] = useState<string | null>(null);

  const [text, setText] = useState('');
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
  const pendingAudio = useRef<RecordingResult | null>(null);

  /** 녹음을 멈춰 결과를 얻는다. 이미 멈춰 있으면 그때 받아 둔 것을 그대로 쓴다 */
  const takeAudio = useCallback(async () => {
    if (!pendingAudio.current) pendingAudio.current = await stop();
    return pendingAudio.current;
  }, [stop]);

  /**
   * 지금까지 남긴 것을 같은 기록 하나에 붙인다. 없으면 만들고, 있으면 고친다.
   *
   * 모드를 넘나들어도 기록이 둘로 갈라지지 않게 하는 자리다 —
   * 갈라지면 목록에 반쪽짜리 두 건이 남고, 그건 사용자가 낮에 치워야 할 일이 된다.
   */
  const persist = useCallback(
    (patch: { text?: string; audioPath?: string | null; durationMs?: number | null }) => {
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
   */
  useEffect(() => {
    if (resolved !== 'voice') return;
    void start()
      .then((uri) => {
        startFeedback();
        // 경로를 못 받는 구현이면 그냥 넘어간다. 여기서 막으면 녹음 자체가 안 된다
        if (uri) void persist({ audioPath: uri });
      })
      .catch((e) => setError(String(e)));
  }, [resolved, start, persist]);

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
          await persist({ audioPath: out.uri, durationMs: out.durationMs });
          pendingAudio.current = null;
          setResolved('text');
        } else {
          if (text.trim()) {
            await persist({ text });
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
          await persist({ text });
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
  const leave = useCallback(() => router.replace('/log'), [router]);

  const finish = () => {
    void (async () => {
      try {
        const out = await takeAudio();
        // 길이를 여기서 같이 넣는다. 나중에 파일에서 다시 읽으면 되지 않느냐면,
        // 목록 한 화면을 그리려고 오디오 파일 수십 개를 여는 일이 된다
        await persist({ audioPath: out.uri, durationMs: out.durationMs });
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
          await persist({ text });
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

            <Input multiline autoFocus value={text} onChangeText={setText} placeholder="기억나는 것부터" />

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
          {rec.isRecording && <View style={s.dot} />}
          <AppText size="display" weight="bold" color={rec.isRecording ? c.running : c.fgFaint}>
            {mmss(rec.durationMs)}
          </AppText>
        </View>

        <Waveform level={rec.level} active={rec.isRecording} />

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
