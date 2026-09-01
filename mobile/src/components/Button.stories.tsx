import type { Meta, StoryObj } from '@storybook/react-native';
import { View } from 'react-native';

import { AppText } from '@shared/ui';
import { c, sp } from '@theme/token';

import { Button } from './Button';
import { Stack } from './layout';

const meta = {
  title: 'components/Button',
  component: Button,
  argTypes: {
    variant: { control: 'select', options: ['primary', 'secondary', 'ghost', 'danger'] },
    size: { control: 'select', options: ['base', 'sm'] },
    disabled: { control: 'boolean' },
    loading: { control: 'boolean' },
  },
  args: { label: '기록 저장', variant: 'primary', size: 'base', onPress: () => {} },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

/**
 * 네 종류가 **한 화면에 같이 있어도 서열이 읽히는지**가 판정 대상이다.
 * 주 버튼만 흰색이고 나머지는 전부 무채색 채움이라 시선이 한 곳으로 간다.
 */
export const 종류: Story = {
  render: () => (
    <Stack gap={sp[3]}>
      <Button label="기록 저장" onPress={() => {}} />
      <Button label="나중에 하기" variant="secondary" onPress={() => {}} />
      <Button label="건너뛰기" variant="ghost" onPress={() => {}} />
      <Button label="기록 삭제" variant="danger" onPress={() => {}} />
      <AppText size="caption" color={c.fgFaint}>
        danger만 테두리다. 새벽에 실수로 누르기 어렵게 하려는 의도다
      </AppText>
    </Stack>
  ),
};

/**
 * 비활성은 **흐린 것이 아니라 꺼진 것**이다.
 * 투명도를 낮추는 대신 채운 회색으로 죽인다 — 당근의 동의 화면과 같은 처리다.
 */
export const 비활성과로딩: Story = {
  render: () => (
    <Stack gap={sp[3]}>
      <Button label="시작하기" disabled onPress={() => {}} />
      <Button label="저장 중" loading onPress={() => {}} />
      <Button label="나중에 하기" variant="secondary" disabled onPress={() => {}} />
      <AppText size="caption" color={c.fgFaint}>
        비활성 버튼이 눌러도 될 것처럼 보이면 실패다
      </AppText>
    </Stack>
  ),
};

/** 화면 하단에 붙는 실제 모양. 주 버튼은 폭을 꽉 채운다. */
export const 화면하단: Story = {
  render: () => (
    <View style={{ height: 320, justifyContent: 'flex-end', gap: sp[3] }}>
      <Button label="본인 인증하기" onPress={() => {}} haptic />
      <Button label="내 명의의 휴대폰이 아니라면" variant="ghost" size="sm" onPress={() => {}} />
    </View>
  ),
};

/** 작은 버튼은 목록 안이나 시트 안에서만 쓴다. 기본은 언제나 56이다. */
export const 크기: Story = {
  render: () => (
    <Stack gap={sp[3]}>
      <Button label="base · 56" onPress={() => {}} />
      <Button label="sm · 48" size="sm" variant="secondary" onPress={() => {}} />
    </Stack>
  ),
};
