import { Check } from 'lucide-react-native';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import type { ComicStatus } from '@shared/api/comic';
import { AppText } from '@shared/ui';
import { c, r, sp } from '@theme/token';

import { COMIC_STEPS, stepStates } from './logic';

const MARK = 22;

/**
 * CM-2 진행(계획서 003 — "막연한 스피너가 아니라 3단계 체크리스트").
 * 지금 하는 단계만 청록으로 돈다 — 절대 규칙 5의 "진행 중"이 정확히 이 자리다.
 */
export function ComicSteps({ status }: { status: ComicStatus }) {
  const states = stepStates(status);
  return (
    <View style={s.list}>
      {COMIC_STEPS.map((label, i) => {
        const st = states[i];
        return (
          <View key={label} style={s.row}>
            <View style={s.mark}>
              {st === 'done' ? (
                <Check size={18} strokeWidth={2} color={c.fg} />
              ) : st === 'active' ? (
                <ActivityIndicator size="small" color={c.running} />
              ) : (
                <View style={s.dot} />
              )}
            </View>
            <AppText color={st === 'waiting' ? c.fgDisabled : st === 'active' ? c.running : c.fg}>{label}</AppText>
          </View>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  list: { gap: sp[4] },
  row: { flexDirection: 'row', alignItems: 'center', gap: sp[3] },
  mark: { width: MARK, height: MARK, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 8, height: 8, borderRadius: r.chip, backgroundColor: c.line },
});
