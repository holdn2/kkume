import type { Meta, StoryObj } from '@storybook/react-native';
import { View } from 'react-native';

import { c, font, sp, type } from '@theme/token';

import { AppText } from './AppText';

const meta = {
  title: 'shared/AppText',
  component: AppText,
  // Controls는 TypeScript를 거치지 않는다. 자유 입력으로 두면
  // 없는 스케일 이름이 들어와 type[size]가 undefined가 되고 그대로 크래시한다.
  // 고를 수 있는 값만 주는 것이 맞다.
  argTypes: {
    size: { control: 'select', options: Object.keys(type) },
    weight: { control: 'select', options: Object.keys(font) },
    color: {
      control: 'select',
      options: [c.fg, c.fgMuted, c.fgFaint, c.fgDisabled, c.running, c.warning, c.danger],
    },
    tight: { control: 'boolean' },
  },
  args: {
    children: '바다 위를 걷는 꿈을 꿨다',
    size: 'body',
    weight: 'regular',
  },
} satisfies Meta<typeof AppText>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

/** 여섯 단계가 서로 구분되는지 본다. label(15)과 body(16)는 붙여 놔야 구분된다. */
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

/** 최소 밝기에서 fgFaint까지 읽히는지, fgDisabled가 확실히 꺼져 보이는지 확인한다. */
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
