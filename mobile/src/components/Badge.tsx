import { StyleSheet, View } from 'react-native';

import { AppText } from '@shared/ui';
import { c, r, sp } from '@theme/token';

// running은 "진행 중"에만 쓴다 — 녹음 중 · 생성 중 · 미확인 기록 (절대 규칙 5번).
type Tone = 'running' | 'warning' | 'danger' | 'neutral';

/**
 * 채움과 테두리가 서로 다른 것을 뜻한다.
 *
 * - `solid` — **상태**다. 지금 이 기록에 무슨 일이 벌어지고 있는지 (동기화 대기 · 실패)
 * - `outline` — **분류**다. 눌러도 아무 일 없고 그냥 붙어 있는 꼬리표 (4컷 · 악몽)
 *
 * 둘을 같은 모양으로 그리면 새벽에 "봐야 할 것"과 "그냥 있는 것"이 섞인다.
 */
type Variant = 'solid' | 'outline';

const TONE: Record<Tone, { fg: string; bg: string }> = {
  running: { fg: c.running, bg: c.runningBg },
  warning: { fg: c.warning, bg: c.warningBg },
  danger: { fg: c.danger, bg: c.dangerBg },
  neutral: { fg: c.fgMuted, bg: c.raised },
};

export function Badge({
  label,
  tone = 'neutral',
  variant = 'solid',
}: {
  label: string;
  tone?: Tone;
  variant?: Variant;
}) {
  const t = TONE[tone];
  const outline = variant === 'outline';

  return (
    <View
      style={[
        s.badge,
        outline
          ? { borderWidth: 1, borderColor: tone === 'neutral' ? c.line : t.fg }
          : { backgroundColor: t.bg },
      ]}>
      <AppText size="caption" weight="medium" color={outline && tone === 'neutral' ? c.fgFaint : t.fg}>
        {label}
      </AppText>
    </View>
  );
}

const s = StyleSheet.create({
  badge: {
    paddingHorizontal: sp[2],
    paddingVertical: 3,
    borderRadius: r.chip,
    // 부모 폭을 채우지 않는다. 목록 행 안에 끼워 넣는 용도다
    alignSelf: 'flex-start',
  },
});
