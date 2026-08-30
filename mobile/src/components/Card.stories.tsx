import type { Meta, StoryObj } from '@storybook/react-native';
import { View } from 'react-native';

import { Badge } from './Badge';
import { Card } from './Card';
import { Row } from './layout';
import { AppText } from '@shared/ui/AppText';
import { c, sp } from '@theme/token';

const meta = {
  title: 'components/Card',
  component: Card,
  argTypes: { selected: { control: 'boolean' } },
} satisfies Meta<typeof Card>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * 진짜 확인할 것은 **카드가 배경에서 떠 보이는가**다.
 * 최소 밝기에서 묻히면 목록 화면이 통째로 평평해진다.
 */
export const Basic: Story = {
  render: () => (
    <View style={{ gap: sp[3] }}>
      <Card>
        <AppText weight="semibold">바다 위를 걷는 꿈</AppText>
        <AppText size="caption" color={c.fgFaint}>
          8월 30일 · 새벽 4:12
        </AppText>
      </Card>
      <Card selected>
        <AppText weight="semibold">선택된 카드</AppText>
        <AppText size="caption" color={c.fgFaint}>
          테두리가 보라로 바뀌고 배경에 옅은 틴트가 깔린다
        </AppText>
      </Card>
    </View>
  ),
};

/** 실제 꿈 로그 목록에 가까운 모양. 카드끼리 붙었을 때 경계가 보이는지 본다. */
export const 목록: Story = {
  render: () => (
    <View style={{ gap: sp[3] }}>
      <Card onPress={() => {}}>
        <Row>
          <AppText weight="semibold" style={{ flex: 1 }}>
            검은 새가 어깨에 앉았다
          </AppText>
          <Badge label="확인 필요" tone="running" />
        </Row>
        <AppText size="caption" color={c.fgMuted} numberOfLines={2}>
          발밑이 유리처럼 단단했고 파도 소리가 아주 멀리서 들렸다
        </AppText>
      </Card>
      <Card onPress={() => {}}>
        <Row>
          <AppText weight="semibold" style={{ flex: 1 }}>
            끝없이 이어지는 복도
          </AppText>
          <Badge label="동기화 대기" tone="warning" />
        </Row>
        <AppText size="caption" color={c.fgFaint}>
          8월 29일 · 새벽 5:40
        </AppText>
      </Card>
      <Card onPress={() => {}}>
        <AppText weight="semibold">제목 없는 기록</AppText>
        <AppText size="caption" color={c.fgFaint}>
          8월 28일
        </AppText>
      </Card>
    </View>
  ),
};
