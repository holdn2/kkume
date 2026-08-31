import type { Meta, StoryObj } from '@storybook/react-native';

import { Progress } from './Progress';
import { Stack } from './layout';
import { AppText } from '@shared/ui/AppText';
import { c, sp } from '@theme/token';

const meta = {
  title: 'components/Progress',
  component: Progress,
  argTypes: { indeterminate: { control: 'boolean' } },
  args: { value: 0.4, label: '만화 만드는 중' },
} satisfies Meta<typeof Progress>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

/**
 * **청록이 여기 있는 것이 맞다** — 절대 규칙 5번의 "진행 중"이 정확히 이 자리다.
 * 무채색 화면에서 이 색이 보인다는 것 자체가 신호다.
 */
export const 진행률: Story = {
  render: () => (
    <Stack gap={sp[5]}>
      <Progress value={0} label="0%" />
      <Progress value={0.35} label="35%" />
      <Progress value={0.8} label="80%" />
      <Progress value={1} label="100%" />
      <AppText size="caption" color={c.fgFaint}>
        0일 때 막대가 안 보이고, 100일 때 끝까지 차야 한다
      </AppText>
    </Stack>
  ),
};

/**
 * 만화 생성은 **얼마나 걸릴지 모른다.** 가짜 퍼센트를 보여주면
 * 사용자가 그 숫자를 믿고 기다리다 배신당한다.
 */
export const 끝을모를때: Story = {
  render: () => (
    <Stack gap={sp[5]}>
      <Progress indeterminate label="만화 만드는 중" />
      <AppText size="caption" color={c.fgFaint}>
        막대가 계속 지나가고 끝점이 없어야 한다
      </AppText>
    </Stack>
  ),
};
