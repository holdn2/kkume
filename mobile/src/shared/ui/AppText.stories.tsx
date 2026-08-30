import type { Meta, StoryObj } from '@storybook/react-native';
import { View } from 'react-native';

import { AppText } from './AppText';
import { c, sp, type } from '@theme/token';

const meta = {
  title: 'shared/AppText',
  component: AppText,
  args: {
    children: '바다 위를 걷는 꿈을 꿨다',
    size: 'body',
    weight: 'regular',
  },
} satisfies Meta<typeof AppText>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

/** 여섯 단계가 서로 구분되는지 본다. 붙여 놓고 봐야 알 수 있다. */
export const Scale: Story = {
  render: () => (
    <View style={{ gap: sp[3] }}>
      {(Object.keys(type) as (keyof typeof type)[]).map((k) => (
        <AppText key={k} size={k}>
          {k} · 바다 위를 걷는 꿈을 꿨다
        </AppText>
      ))}
    </View>
  ),
};

/**
 * 네 굵기가 실제로 달라 보여야 한다.
 * 똑같아 보이면 Pretendard 매핑이 깨진 것이다 — Android에서 특히 잘 난다.
 */
export const Weights: Story = {
  render: () => (
    <View style={{ gap: sp[3] }}>
      <AppText weight="regular">Regular · 바다 위를 걷는 꿈을 꿨다</AppText>
      <AppText weight="medium">Medium · 바다 위를 걷는 꿈을 꿨다</AppText>
      <AppText weight="semibold">SemiBold · 바다 위를 걷는 꿈을 꿨다</AppText>
      <AppText weight="bold">Bold · 바다 위를 걷는 꿈을 꿨다</AppText>
    </View>
  ),
};

/** 최소 밝기에서 fgFaint까지 읽히는지 확인하는 용도다. */
export const Colors: Story = {
  render: () => (
    <View style={{ gap: sp[3] }}>
      <AppText color={c.fg}>fg · 본문</AppText>
      <AppText color={c.fgMuted}>fgMuted · 보조</AppText>
      <AppText color={c.fgFaint}>fgFaint · 메타</AppText>
      <AppText color={c.fgDisabled}>fgDisabled · 비활성</AppText>
      <AppText color={c.running}>running · 진행 중</AppText>
      <AppText color={c.warning}>warning · 동기화 대기</AppText>
      <AppText color={c.danger}>danger · 삭제</AppText>
    </View>
  ),
};
