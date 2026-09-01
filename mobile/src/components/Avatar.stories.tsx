import type { Meta, StoryObj } from '@storybook/react-native';
import { View } from 'react-native';

import { AppText } from '@shared/ui';
import { c, sp } from '@theme/token';

import { Avatar } from './Avatar';
import { Row, Stack } from './layout';

const meta = {
  title: 'components/Avatar',
  component: Avatar,
  argTypes: { size: { control: 'select', options: ['sm', 'base', 'lg'] } },
  args: { name: '밤새는고양이', size: 'base' },
} satisfies Meta<typeof Avatar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

/** 크기 셋. 목록에는 sm, 피드에는 base, 프로필 화면에는 lg를 쓴다. */
export const 크기: Story = {
  render: () => (
    <Row gap={sp[4]}>
      <Avatar name="새벽세시" size="sm" />
      <Avatar name="새벽세시" size="base" />
      <Avatar name="새벽세시" size="lg" />
    </Row>
  ),
};

/**
 * **같은 이름은 늘 같은 색이어야 한다.** 위아래 두 줄이 같은 이름 목록인데
 * 순서만 다르다. 짝이 되는 아바타의 색이 같지 않으면 색이 신호로 못 쓰인다.
 */
export const 같은이름같은색: Story = {
  render: () => (
    <Stack gap={sp[4]}>
      <Row gap={sp[2]}>
        {['가온', '노을', '단비', '마루', '바람'].map((n) => (
          <Avatar key={n} name={n} />
        ))}
      </Row>
      <Row gap={sp[2]}>
        {['바람', '단비', '가온', '노을', '마루'].map((n) => (
          <Avatar key={n} name={n} />
        ))}
      </Row>
      <AppText size="caption" color={c.fgFaint}>
        위아래에서 같은 이름의 색이 같아야 한다
      </AppText>
    </Stack>
  ),
};

/** 커뮤니티 목록에 실제로 놓일 모양. 색이 사람을 구분하는 유일한 수단이다. */
export const 목록: Story = {
  render: () => (
    <View style={{ gap: sp[3] }}>
      {[
        ['밤새는고양이', '10분 전'],
        ['새벽세시', '1시간 전'],
        ['구름한점', '3시간 전'],
        ['긴복도', '어제'],
      ].map(([n, t]) => (
        <Row key={n} gap={sp[3]}>
          <Avatar name={n} />
          <AppText size="label" style={{ flex: 1 }}>
            {n}
          </AppText>
          <AppText size="caption" color={c.fgFaint}>
            {t}
          </AppText>
        </Row>
      ))}
      <AppText size="caption" color={c.fgFaint}>
        네 명의 색이 최소 밝기에서 서로 구분돼야 한다
      </AppText>
    </View>
  ),
};
