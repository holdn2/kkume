import type { Meta, StoryObj } from '@storybook/react-native';
import { View } from 'react-native';

import { Card } from './Card';
import { Skeleton } from './Skeleton';
import { Row, Stack } from './layout';
import { AppText } from '@shared/ui/AppText';
import { c, sp } from '@theme/token';

const meta = {
  title: 'components/Skeleton',
  component: Skeleton,
  // width는 DimensionValue라 유니온으로 못 묶는다. 자유 입력이 불가피한 자리다
  argTypes: { circle: { control: 'boolean' }, height: { control: 'number' } },
  args: { width: '100%', height: 16 },
} satisfies Meta<typeof Skeleton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

/** 줄 · 원 · 덩어리 셋이면 대부분의 자리를 채운다. */
export const 모양: Story = {
  render: () => (
    <Stack gap={sp[4]}>
      <Skeleton width="70%" height={16} />
      <Skeleton height={40} circle />
      <Skeleton height={90} />
    </Stack>
  ),
};

/**
 * 꿈로그가 로컬 SQLite를 읽는 사이. **서버를 기다리는 것이 아니라 이미 있는 것을 꺼내는 중**이라
 * 길어야 한 박자다. 그래서 반짝이는 띠를 쓰지 않고 밝기만 조용히 오르내린다.
 */
export const 꿈로그로딩: Story = {
  render: () => (
    <View style={{ gap: sp[3] }}>
      {[0, 1, 2].map((i) => (
        <Card key={i}>
          <Row gap={sp[3]}>
            <Skeleton width="55%" height={18} />
          </Row>
          <Skeleton width="30%" height={13} />
        </Card>
      ))}
      <AppText size="caption" color={c.fgFaint}>
        깜빡임이 거슬리지 않아야 한다. 거슬리면 새벽에는 더하다
      </AppText>
    </View>
  ),
};
