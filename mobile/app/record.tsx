import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Input, Screen } from '@components';
import { tapFeedback } from '@shared/haptics';
import { AppText } from '@shared/ui';
import { c, hit, r, sp } from '@theme/token';

type Mode = 'voice' | 'text';

/**
 * RM-1. **새벽에 반쯤 자면서 보는 유일한 화면**이고, 이 앱에서 유일하게
 * 1픽셀까지 신경 쓰는 화면이다(계획서 8장).
 *
 * 잠금화면 위젯과 알림이 `kkume://record?mode=voice|text`로 여기를 연다.
 * 탭 밖에 있어서 **탭바가 없다** — 탭바는 "다른 데 갈 수 있다"는 신호이고
 * 그것이 곧 결정이다(절대 규칙 7).
 *
 * 지금은 껍데기다. 녹음과 저장은 `expo-audio`·`expo-sqlite`를 붙이면서 연결한다.
 * 레이아웃과 진입 경로를 **네이티브 없이 먼저 확정**해 두려는 것이다.
 */
export default function RecordModal() {
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  const router = useRouter();

  // 알 수 없는 값이 와도 음성으로 간다. 새벽에 "무엇으로 기록할까요"를 묻지 않는다
  const resolved: Mode = mode === 'text' ? 'text' : 'voice';

  const [seconds, setSeconds] = useState(0);
  const [text, setText] = useState('');

  useEffect(() => {
    if (resolved !== 'voice') return;
    // TODO: 여기서 실제 녹음이 시작된다. 지금은 타이머만 돈다
    tapFeedback();
    const t = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [resolved]);

  const stop = () => {
    tapFeedback();
    // TODO: 녹음 정지 → SQLite 저장 → 화면 종료
    router.back();
  };

  if (resolved === 'text') {
    return (
      <Screen night>
        <View style={{ flex: 1, gap: sp[4], paddingTop: sp[8] }}>
          <AppText size="title" weight="bold">
            어떤 꿈이었나요
          </AppText>
          <Input multiline autoFocus value={text} onChangeText={setText} placeholder="기억나는 것부터" />
          <AppText size="caption" color={c.fgFaint}>
            나가면 저장됩니다
          </AppText>
        </View>
      </Screen>
    );
  }

  return (
    <Screen night>
      <View style={s.top}>
        {/* "녹음 중"이라고 쓰지 않는다. 점 하나와 색으로 충분하고, 읽을 여력이 없다 */}
        <View style={s.dotRow}>
          <View style={s.dot} />
          <AppText size="display" weight="bold" color={c.running}>
            {String(Math.floor(seconds / 60)).padStart(2, '0')}:
            {String(seconds % 60).padStart(2, '0')}
          </AppText>
        </View>

        {/* TODO: 파형. 이 앱에서 유일하게 살아 있는 모션이다 */}
        <View style={s.wavePlaceholder} />
      </View>

      {/* 정지 버튼은 화면 하단 1/4 지점 — 누워서 한 손으로 잡았을 때 엄지가 닿는 자리다.
          취소·삭제는 두지 않는다. 새벽에 잘못 눌러 기록이 사라지는 손실이 훨씬 크다 */}
      <View style={s.stopArea}>
        <Pressable
          onPress={stop}
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
  top: { flex: 3, justifyContent: 'center', alignItems: 'center', gap: sp[6] },
  dotRow: { flexDirection: 'row', alignItems: 'center', gap: sp[3] },
  dot: { width: 10, height: 10, borderRadius: r.chip, backgroundColor: c.running },
  wavePlaceholder: { height: 64, alignSelf: 'stretch' },
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
