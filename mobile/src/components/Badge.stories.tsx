import type { Meta, StoryObj } from '@storybook/react-native';
import { View } from 'react-native';

import { Badge } from './Badge';
import { Row } from './layout';
import { AppText } from '@shared/ui/AppText';
import { c, sp } from '@theme/token';

const meta = {
  title: 'components/Badge',
  component: Badge,
  argTypes: {
    tone: { control: 'select', options: ['running', 'warning', 'danger', 'neutral'] },
    variant: { control: 'select', options: ['solid', 'outline'] },
  },
  args: { label: '동기화 대기', tone: 'warning', variant: 'solid' },
} satisfies Meta<typeof Badge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

/**
 * 오프라인 우선 구조라 **"저장됨 / 동기화 대기 / 실패" 세 상태가 사용자에게 보여야 한다.**
 * 새벽에 적은 것이 서버에 안 올라간 상태에서 아무 표시가 없으면
 * 사용자는 기록이 사라졌다고 오해한다.
 *
 * 배경을 반투명에서 불투명으로 바꾼 것이 이 스토리의 판정 대상이다.
 */
export const 동기화상태: Story = {
  render: () => (
    <View style={{ gap: sp[3] }}>
      <Row gap={sp[2]}>
        <Badge label="저장됨" tone="neutral" />
        <Badge label="동기화 대기" tone="warning" />
        <Badge label="실패" tone="danger" />
      </Row>
      <AppText size="caption" color={c.fgFaint}>
        세 상태가 최소 밝기에서도 서로 구분돼야 한다
      </AppText>
    </View>
  ),
};

/**
 * **채움은 상태, 테두리는 분류다.**
 * 같은 모양으로 그리면 새벽에 "봐야 할 것"과 "그냥 있는 것"이 섞인다.
 */
export const 채움과테두리: Story = {
  render: () => (
    <View style={{ gap: sp[4] }}>
      <View style={{ gap: sp[2] }}>
        <AppText size="caption" color={c.fgMuted}>
          solid · 상태 — 지금 이 기록에 무슨 일이 벌어지는가
        </AppText>
        <Row gap={sp[2]}>
          <Badge label="녹음 중" tone="running" />
          <Badge label="동기화 대기" tone="warning" />
          <Badge label="실패" tone="danger" />
        </Row>
      </View>

      <View style={{ gap: sp[2] }}>
        <AppText size="caption" color={c.fgMuted}>
          outline · 분류 — 그냥 붙어 있는 꼬리표
        </AppText>
        <Row gap={sp[2]}>
          <Badge label="4컷" variant="outline" />
          <Badge label="악몽" variant="outline" />
          <Badge label="자각몽" variant="outline" />
        </Row>
      </View>

      <AppText size="caption" color={c.fgFaint}>
        위 줄은 눈에 걸려야 하고, 아래 줄은 걸리지 않아야 한다
      </AppText>
    </View>
  ),
};

/** running은 "진행 중"에만 쓴다 — 절대 규칙 5번. */
export const 진행중: Story = {
  render: () => (
    <View style={{ gap: sp[3] }}>
      <Row gap={sp[2]}>
        <Badge label="녹음 중" tone="running" />
        <Badge label="만화 생성 중" tone="running" />
        <Badge label="미확인" tone="running" />
      </Row>
      <AppText size="caption" color={c.fgFaint}>
        청록이 진행 중 외의 자리에 보이면 잘못 쓴 것이다
      </AppText>
    </View>
  ),
};
