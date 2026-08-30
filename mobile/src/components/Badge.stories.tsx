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
  },
  args: { label: '동기화 대기', tone: 'warning' },
} satisfies Meta<typeof Badge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

/**
 * 오프라인 우선 구조라 **"저장됨 / 동기화 대기 / 실패" 세 상태가 사용자에게 보여야 한다.**
 * 새벽에 적은 것이 서버에 안 올라간 상태에서 아무 표시가 없으면
 * 사용자는 기록이 사라졌다고 오해한다.
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

/** running은 "진행 중"에만 쓴다 — 절대 규칙 5번. */
export const Tones: Story = {
  render: () => (
    <View style={{ gap: sp[3] }}>
      <Row gap={sp[2]}>
        <Badge label="녹음 중" tone="running" />
        <Badge label="확인 필요 2" tone="running" />
      </Row>
      <Row gap={sp[2]}>
        <Badge label="동기화 대기" tone="warning" />
        <Badge label="오프라인" tone="warning" />
      </Row>
      <Row gap={sp[2]}>
        <Badge label="신고됨" tone="danger" />
        <Badge label="블라인드" tone="danger" />
      </Row>
      <Row gap={sp[2]}>
        <Badge label="4컷" tone="neutral" />
        <Badge label="8컷" tone="neutral" />
      </Row>
      <AppText size="caption" color={c.fgFaint}>
        청록(running)이 진행 중 외의 자리에 보이면 잘못 쓴 것이다
      </AppText>
    </View>
  ),
};
