import { useLocalSearchParams, useRouter } from 'expo-router';
import { X } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import { Keyboard, KeyboardAvoidingView, Platform, Pressable, StyleSheet, View } from 'react-native';

import { Input, Row, Screen } from '@components';
import { Waveform } from '@features/record/Waveform';
import { useRecorder } from '@shared/audio';
import { getDreamRepo } from '@shared/db';
import { savedFeedback, startFeedback } from '@shared/haptics';
import { AppText } from '@shared/ui';
import { c, hit, r, sp } from '@theme/token';

type Mode = 'voice' | 'text';

/** 입력이 이만큼 멈추면 저장한다. 짧으면 타이핑 중에 깜빡이고, 길면 불안해진다 */
const IDLE_SAVE_MS = 1200;

function mmss(ms: number) {
  const s = Math.floor(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * RM-1. **새벽에 반쯤 자면서 보는 유일한 화면**이고, 이 앱에서 유일하게
 * 1픽셀까지 신경 쓰는 화면이다(계획서 8장).
 *
 * 잠금화면 위젯과 알림이 `kkume://record?mode=voice|text`로 여기를 연다.
 * 탭 밖에 있어서 탭바가 없다 — 탭바는 "다른 데 갈 수 있다"는 신호이고
 * 그것이 곧 결정이다(절대 규칙 7).
 */
export default function RecordModal() {
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  const router = useRouter();

  // 알 수 없는 값이 와도 음성으로 간다. 새벽에 "무엇으로 기록할까요"를 묻지 않는다
  const resolved: Mode = mode === 'text' ? 'text' : 'voice';

  const rec = useRecorder();
  const { start, stop } = rec;
  const [error, setError] = useState<string | null>(null);

  const [text, setText] = useState('');
  const [dreamId, setDreamId] = useState<string | null>(null);
  // "저장됨"을 상태로 들고 껐다 켜면 effect 안에서 setState를 하게 된다.
  // 저장된 내용을 기억해 두고 **지금 내용과 같은지로 파생**시키면 그럴 일이 없다
  const [savedText, setSavedText] = useState<string | null>(null);
  const saved = savedText !== null && savedText === text;

  // 들어오자마자 녹음이 시작된다. 시작 버튼을 누르게 하면 그게 결정이다.
  // start는 신원이 안정적이라 이 effect는 한 번만 돈다.
  useEffect(() => {
    if (resolved !== 'voice') return;
    void start()
      .then(startFeedback)
      .catch((e) => setError(String(e)));
  }, [resolved, start]);

  // 텍스트는 멈추면 저장한다. 저장 버튼을 두면 "저장할까 말까"가 생긴다
  useEffect(() => {
    if (resolved !== 'text' || !text.trim()) return;
    const t = setTimeout(() => {
      void (async () => {
        try {
          const repo = await getDreamRepo();
          if (dreamId) await repo.update(dreamId, { text });
          else setDreamId((await repo.create({ text })).id);
          setSavedText(text);
          savedFeedback();
        } catch (e) {
          setError(String(e));
        }
      })();
    }, IDLE_SAVE_MS);
    return () => clearTimeout(t);
  }, [text, resolved, dreamId]);

  /**
   * 끝내면 **꿈로그로 보낸다.** `back()`은 들어온 곳으로 돌려보내는데,
   * 위젯으로 들어왔으면 돌아갈 곳이 없고 탭에서 들어왔으면 빠른기록으로 되돌아간다 —
   * 방금 남긴 것이 어디 갔는지 알 수 없는 자리다. 목록은 저장됐다는 증거이기도 하다.
   */
  const leave = useCallback(() => router.replace('/log'), [router]);

  const finish = () => {
    void (async () => {
      try {
        const out = await stop();
        const repo = await getDreamRepo();
        await repo.create({ audioPath: out.uri, recordedAt: new Date().toISOString() });
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
          const repo = await getDreamRepo();
          if (dreamId) await repo.update(dreamId, { text });
          else await repo.create({ text });
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
  textBody: { flex: 1, gap: sp[4], paddingTop: sp[8] },
  top: { flex: 3, justifyContent: 'center', alignItems: 'center', gap: sp[6] },
  dotRow: { flexDirection: 'row', alignItems: 'center', gap: sp[3] },
  dot: { width: 10, height: 10, borderRadius: r.chip, backgroundColor: c.running },
  stopArea: { flex: 1, alignItems: 'center', justifyContent: 'center' },
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
