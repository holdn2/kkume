import { Link } from 'expo-router';
import { View, StyleSheet } from 'react-native';

import { AppText } from '@shared/ui/AppText';
import { c, sp, r } from '@theme/token';

// 골격 확인용 임시 화면. 2주차 기록 코어 이슈에서 실제 화면으로 대체한다.
export default function Home() {
  return (
    <View style={s.root}>
      <AppText size="caption" color={c.fgFaint}>
        꾸메
      </AppText>
      <AppText size="title" weight="bold">
        골격이 섰다
      </AppText>

      <View style={s.gap} />
      <AppText weight="regular" color={c.fgMuted}>
        Regular · 꿈을 기억나는 대로 적어두세요
      </AppText>
      <AppText weight="medium" color={c.fgMuted}>
        Medium · 꿈을 기억나는 대로 적어두세요
      </AppText>
      <AppText weight="semibold" color={c.fgMuted}>
        SemiBold · 꿈을 기억나는 대로 적어두세요
      </AppText>
      <AppText weight="bold" color={c.fgMuted}>
        Bold · 꿈을 기억나는 대로 적어두세요
      </AppText>
      <AppText size="caption" color={c.running}>
        네 굵기가 서로 달라 보이면 Pretendard 매핑이 정상이다
      </AppText>

      <View style={s.gap} />
      <Link href="/storybook" style={s.link}>
        <AppText size="label" weight="semibold" color={c.actionFg}>
          스토리북 열기
        </AppText>
      </Link>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: c.bg, padding: sp[5], justifyContent: 'center', gap: sp[2] },
  gap: { height: sp[4] },
  link: {
    backgroundColor: c.action,
    borderRadius: r.full,
    paddingVertical: sp[4],
    paddingHorizontal: sp[5],
    textAlign: 'center',
  },
});
