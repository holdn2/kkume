import { useEffect, useState } from 'react';
import { Animated, Pressable, StyleSheet, View } from 'react-native';

import { tapFeedback } from '@shared/haptics';
import { AppText } from '@shared/ui/AppText';
import { c, dur, hit, press, r, sp } from '@theme/token';

const TRACK_W = 52;
const TRACK_H = 32;
const PAD = 3;
const THUMB = TRACK_H - PAD * 2;

type Props = {
  value: boolean;
  onChange: (next: boolean) => void;
  label?: string;
  description?: string;
  disabled?: boolean;
};

/**
 * 켜짐이 **흰 채움**이다. 무채색 UI에서 "켜져 있다"는 가장 밝은 것으로 표현한다.
 *
 * 트랙 색은 애니메이션하지 않고 손잡이만 움직인다.
 * `backgroundColor`는 네이티브 드라이버로 못 돌리는데, 그것 하나 때문에
 * 전체를 JS 드라이버로 내리면 목록을 스크롤하는 중에 프레임이 튄다.
 */
export function Switch({ value, onChange, label, description, disabled }: Props) {
  // useRef로 잡으면 렌더 중에 .current를 읽게 되고 새 훅 규칙이 이를 막는다.
  // Animated.Value는 한 번만 만들어지면 되므로 useState의 지연 초기화가 맞다.
  const [x] = useState(() => new Animated.Value(value ? 1 : 0));

  useEffect(() => {
    Animated.timing(x, { toValue: value ? 1 : 0, duration: dur.fast, useNativeDriver: true }).start();
  }, [value, x]);

  const track = disabled ? c.surface : value ? c.action : c.raised;
  const thumb = disabled ? c.fgDisabled : value ? c.bg : c.fgMuted;

  const knob = (
    <View style={[s.track, { backgroundColor: track }]}>
      <Animated.View
        style={[
          s.thumb,
          {
            backgroundColor: thumb,
            transform: [
              { translateX: x.interpolate({ inputRange: [0, 1], outputRange: [0, TRACK_W - THUMB - PAD * 2] }) },
            ],
          },
        ]}
      />
    </View>
  );

  if (!label) return knob;

  return (
    <Pressable
      onPress={() => {
        if (disabled) return;
        tapFeedback();
        onChange(!value);
      }}
      disabled={disabled}
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled: !!disabled }}
      style={({ pressed }) => [s.row, pressed && !disabled && { opacity: press }]}>
      <View style={{ flex: 1, gap: 2 }}>
        <AppText size="label" color={disabled ? c.fgDisabled : c.fg}>
          {label}
        </AppText>
        {!!description && (
          <AppText size="caption" color={c.fgFaint}>
            {description}
          </AppText>
        )}
      </View>
      {knob}
    </Pressable>
  );
}

const s = StyleSheet.create({
  // 라벨이 있으면 행 전체가 터치 대상이다. 새벽에 스위치만 조준하게 두지 않는다
  row: { minHeight: hit.base, flexDirection: 'row', alignItems: 'center', gap: sp[4], paddingVertical: sp[2] },
  track: { width: TRACK_W, height: TRACK_H, borderRadius: r.chip, padding: PAD, justifyContent: 'center' },
  thumb: { width: THUMB, height: THUMB, borderRadius: r.chip },
});
