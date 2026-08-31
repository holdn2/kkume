import type { Meta, StoryObj } from '@storybook/react-native';
import { View } from 'react-native';

import { Badge } from './Badge';
import { Card } from './Card';
import { Row, Stack } from './layout';
import { AppText } from '@shared/ui/AppText';
import { c, r, sp } from '@theme/token';

const meta = {
  title: 'components/Card',
  component: Card,
  argTypes: { selected: { control: 'boolean' } },
} satisfies Meta<typeof Card>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  args: { selected: false },
  render: (args) => (
    <Card {...args}>
      <AppText weight="semibold">바다 위를 걷는 꿈</AppText>
      <AppText size="caption" color={c.fgFaint}>
        오늘 05:12
      </AppText>
    </Card>
  ),
};

/**
 * **최소 밝기에서 카드가 배경과 갈라지는가.** 이게 이 컴포넌트의 유일한 질문이다.
 * 테두리를 걷어내고 채움만 남겼으므로, 안 갈라지면 `surface`를 한 단계 올려야 한다.
 */
export const 목록: Story = {
  render: () => (
    <Stack gap={sp[3]}>
      {[
        { t: '바다 위를 걷는 꿈', d: '오늘 05:12', s: '저장됨' },
        { t: '이빨이 빠지는 꿈', d: '어제 06:40', s: '동기화 대기' },
        { t: '아주 긴 복도', d: '8월 28일 05:55', s: '저장됨' },
      ].map((it) => (
        <Card key={it.t} onPress={() => {}}>
          <Row>
            <AppText weight="semibold" style={{ flex: 1 }}>
              {it.t}
            </AppText>
            <Badge
              label={it.s}
              tone={it.s === '저장됨' ? 'neutral' : 'warning'}
            />
          </Row>
          <AppText size="caption" color={c.fgFaint}>
            {it.d}
          </AppText>
        </Card>
      ))}
      <AppText size="caption" color={c.fgFaint}>
        카드끼리, 그리고 카드와 배경이 구분되는지 최소 밝기에서 본다
      </AppText>
    </Stack>
  ),
};

/** 선택은 **테두리가 생기는 것**으로 보인다. 쉬는 상태에는 테두리가 없다. */
export const 선택: Story = {
  render: () => (
    <Stack gap={sp[3]}>
      <Card>
        <AppText weight="semibold">4컷</AppText>
        <AppText size="caption" color={c.fgFaint}>
          짧게 요약된 만화
        </AppText>
      </Card>
      <Card selected>
        <AppText weight="semibold">8컷</AppText>
        <AppText size="caption" color={c.fgFaint}>
          장면이 더 이어진다
        </AppText>
      </Card>
      <AppText size="caption" color={c.fgFaint}>
        선택된 쪽이 한눈에 보여야 한다
      </AppText>
    </Stack>
  ),
};

/** 만화가 들어가면 색은 콘텐츠가 담당한다. UI가 무채색인 이유가 이것이다. */
export const 만화카드: Story = {
  render: () => (
    <Card onPress={() => {}} style={{ padding: 0, overflow: 'hidden' }}>
      <View style={{ flexDirection: 'row', height: 120 }}>
        {['#39496B', '#4A3A6B', '#2F5A52', '#6B4738'].map((bg) => (
          <View key={bg} style={{ flex: 1, backgroundColor: bg }} />
        ))}
      </View>
      <View style={{ padding: sp[4], gap: sp[2] }}>
        <Row>
          <AppText weight="semibold" style={{ flex: 1 }}>
            바다 위를 걷는 꿈
          </AppText>
          <Badge label="4컷" variant="outline" />
        </Row>
        <View style={{ height: 1, backgroundColor: c.line, borderRadius: r.chip }} />
        <AppText size="caption" color={c.fgFaint}>
          오늘 05:12 · 8초 녹음
        </AppText>
      </View>
    </Card>
  ),
};
