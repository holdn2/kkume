import { StyleSheet, View } from 'react-native';

import { AppText } from '@shared/ui/AppText';
import { c, r, sp, tint } from '@theme/token';

// running은 "진행 중"에만 쓴다 — 녹음 중 · 생성 중 · 미확인 기록 (절대 규칙 5번).
// 그 밖에 쓰면 새벽에 색으로 상태를 읽을 수 없게 된다.
type Tone = 'running' | 'warning' | 'danger' | 'neutral';

const TONE: Record<Tone, { fg: string; bg: string }> = {
  running: { fg: c.running, bg: tint.running },
  warning: { fg: c.warning, bg: tint.warning },
  danger: { fg: c.danger, bg: tint.danger },
  neutral: { fg: c.fgMuted, bg: c.field },
};

export function Badge({ label, tone = 'neutral' }: { label: string; tone?: Tone }) {
  const t = TONE[tone];
  return (
    <View style={[s.badge, { backgroundColor: t.bg }]}>
      <AppText size="caption" weight="medium" color={t.fg}>
        {label}
      </AppText>
    </View>
  );
}

const s = StyleSheet.create({
  badge: {
    paddingHorizontal: sp[2],
    paddingVertical: 2,
    borderRadius: r.sm,
    // 부모 폭을 채우지 않는다. 목록 행 안에 끼워 넣는 용도다
    alignSelf: 'flex-start',
  },
});
