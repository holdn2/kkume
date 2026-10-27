import { Pressable, StyleSheet, View } from 'react-native';

import { Segmented, Stack } from '@components';
import { tapFeedback } from '@shared/haptics';
import { AppText } from '@shared/ui';
import { c, press, r, sp } from '@theme/token';

import { joinTime, reminderLabel, splitTime, type ReminderTime } from './logic';

const HALF = [
  { value: 'am', label: '오전' },
  { value: 'pm', label: '오후' },
] as const;
const HOURS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
/** 10분 단위 — 확인 알림이라 그보다 촘촘할 이유가 없다 */
const MINUTES = ['00', '10', '20', '30', '40', '50'].map((m) => ({ value: m, label: m }));

/**
 * 낮 확인 알림 시각 직접 정하기(이슈 #153). 시스템 시계 휠은 새 네이티브 모듈이라 빌드가 필요하다 —
 * 앱의 세그먼트(`Segmented`)와 같은 모양으로 오전/오후 · 시 · 분을 고른다(사용자 — "디자인은 다른 UI와 비슷한 것으로").
 * 시는 열두 칸이라 한 줄 세그먼트에 안 들어가 네 칸씩 세 줄로 놓되, 칸 모양 · 선택 표시는 세그먼트와 같다
 */
export function TimePicker({ value, onChange }: { value: ReminderTime; onChange: (next: ReminderTime) => void }) {
  const { pm, hour12, minute } = splitTime(value);
  const set = (next: { pm?: boolean; hour12?: number; minute?: number }) =>
    onChange(joinTime(next.pm ?? pm, next.hour12 ?? hour12, next.minute ?? minute));

  return (
    <Stack gap={sp[4]}>
      <AppText size="title" weight="bold" style={{ textAlign: 'center' }}>
        {reminderLabel(value)}
      </AppText>
      <Segmented options={HALF} value={pm ? 'pm' : 'am'} onChange={(v) => set({ pm: v === 'pm' })} />
      <View style={s.grid} accessibilityRole="radiogroup" accessibilityLabel="시">
        {HOURS.map((h) => {
          const on = h === hour12;
          return (
            <Pressable
              key={h}
              onPress={() => {
                if (on) return;
                tapFeedback();
                set({ hour12: h });
              }}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              accessibilityLabel={`${h}시`}
              style={({ pressed }) => [s.cell, on && s.on, pressed && !on && { opacity: press }]}>
              <AppText size="label" weight={on ? 'semibold' : 'regular'} color={on ? c.fg : c.fgFaint}>
                {h}시
              </AppText>
            </Pressable>
          );
        })}
      </View>
      <Stack gap={sp[2]}>
        <AppText size="caption" color={c.fgFaint}>
          분
        </AppText>
        <Segmented
          options={MINUTES}
          value={String(minute - (minute % 10)).padStart(2, '0')}
          onChange={(v) => set({ minute: Number(v) })}
        />
      </Stack>
    </Stack>
  );
}

const PAD = 3;

const s = StyleSheet.create({
  // 세그먼트와 같은 바탕 · 간격 · 칸 높이(Segmented.tsx)
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    backgroundColor: c.surface,
    borderRadius: r.surface,
    padding: PAD,
    rowGap: PAD,
  },
  cell: {
    width: '25%',
    height: 42,
    borderRadius: r.chip,
    alignItems: 'center',
    justifyContent: 'center',
  },
  on: { backgroundColor: c.raised },
});
