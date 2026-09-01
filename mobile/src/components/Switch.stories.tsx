import type { Meta, StoryObj } from '@storybook/react-native';
import { useState } from 'react';

import { AppText } from '@shared/ui';
import { c, sp } from '@theme/token';

import { Switch } from './Switch';
import { Stack } from './layout';

const meta = {
  title: 'components/Switch',
  component: Switch,
  argTypes: { disabled: { control: 'boolean' } },
  args: { value: true, label: '기상 알림', onChange: () => {} },
} satisfies Meta<typeof Switch>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

/** 켜짐이 흰 채움이다. 꺼짐과 켜짐이 한눈에 갈려야 한다. */
export const 상태: Story = {
  render: function Render() {
    const [a, setA] = useState(true);
    const [b, setB] = useState(false);
    return (
      <Stack gap={sp[2]}>
        <Switch value={a} onChange={setA} label="기상 알림" description="설정한 시각에 잠금화면으로" />
        <Switch value={b} onChange={setB} label="주간 요약" description="일요일 저녁에 한 번" />
        <Switch value onChange={() => {}} label="공개 프로필" disabled />
        <Switch value={false} onChange={() => {}} label="위치 사용" disabled />
        <AppText size="caption" color={c.fgFaint}>
          비활성 둘은 켜짐·꺼짐이 구분되면서도 만질 수 없어 보여야 한다
        </AppText>
      </Stack>
    );
  },
};

/** 라벨 없이 쓰면 스위치만 그린다. 행 안에 끼워 넣을 때만 이렇게 쓴다. */
export const 스위치만: Story = {
  render: function Render() {
    const [v, setV] = useState(true);
    return (
      <Stack gap={sp[3]}>
        <Switch value={v} onChange={setV} />
        <AppText size="caption" color={c.fgFaint}>
          라벨이 있을 때는 행 전체가 눌린다. 눌러서 확인해 보라
        </AppText>
      </Stack>
    );
  },
};
