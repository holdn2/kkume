import type { Meta, StoryObj } from '@storybook/react-native';
import { View } from 'react-native';

import { Button } from './Button';
import { AppText } from '@shared/ui/AppText';
import { c, sp } from '@theme/token';

const meta = {
  title: 'components/Button',
  component: Button,
  argTypes: {
    variant: { control: 'select', options: ['primary', 'outline', 'ghost', 'danger'] },
    size: { control: 'select', options: ['base', 'sm'] },
    disabled: { control: 'boolean' },
    loading: { control: 'boolean' },
    haptic: { control: 'boolean' },
  },
  args: { label: '저장', variant: 'primary', size: 'base', onPress: () => {} },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

/** danger만 채우지 않고 테두리다 — 새벽에 실수로 누르기 어렵게 하려는 의도다. */
export const Variants: Story = {
  render: () => (
    <View style={{ gap: sp[3] }}>
      <Button label="저장" variant="primary" onPress={() => {}} />
      <Button label="나중에" variant="outline" onPress={() => {}} />
      <Button label="건너뛰기" variant="ghost" onPress={() => {}} />
      <Button label="계정 삭제" variant="danger" onPress={() => {}} />
    </View>
  ),
};

/** base 56 · sm 48. 기본이 56인 이유는 새벽에 손이 정확하지 않기 때문이다. */
export const Sizes: Story = {
  render: () => (
    <View style={{ gap: sp[3] }}>
      <Button label="base · 56" onPress={() => {}} />
      <Button label="sm · 48" size="sm" onPress={() => {}} />
    </View>
  ),
};

/** 비활성과 로딩은 둘 다 눌리지 않는다. 눈으로도 구분돼야 한다. */
export const States: Story = {
  render: () => (
    <View style={{ gap: sp[3] }}>
      <Button label="누를 수 있음" onPress={() => {}} />
      <Button label="비활성" disabled onPress={() => {}} />
      <Button label="로딩 중" loading onPress={() => {}} />
      <View style={{ height: sp[2] }} />
      <Button label="비활성 · outline" variant="outline" disabled onPress={() => {}} />
      <Button label="비활성 · danger" variant="danger" disabled onPress={() => {}} />
    </View>
  ),
};

/** 최소 밝기에서 라벨이 읽히는지, 눌린 상태가 보이는지 확인한다. */
export const 새벽검수: Story = {
  render: () => (
    <View style={{ gap: sp[3] }}>
      <AppText size="caption" color={c.fgFaint}>
        밝기를 최소로 내리고 아래를 확인한다
      </AppText>
      <Button label="바로 기록" onPress={() => {}} haptic />
      <Button label="나중에" variant="ghost" onPress={() => {}} />
      <AppText size="caption" color={c.fgFaint}>
        · 보라 위 어두운 라벨이 읽히는가 (5.91:1)
      </AppText>
      <AppText size="caption" color={c.fgFaint}>
        · ghost 버튼이 배경에 묻히지 않는가
      </AppText>
      <AppText size="caption" color={c.fgFaint}>
        · 눌렀을 때 흐려지는 것이 보이는가
      </AppText>
    </View>
  ),
};
