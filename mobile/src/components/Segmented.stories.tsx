import type { Meta, StoryObj } from '@storybook/react-native';
import { useState } from 'react';

import { Segmented } from './Segmented';
import { Stack } from './layout';
import { AppText } from '@shared/ui/AppText';
import { c, sp } from '@theme/token';

const meta = {
  title: 'components/Segmented',
  component: Segmented,
  args: {
    value: 'week',
    onChange: () => {},
    options: [
      { value: 'week', label: '이번 주' },
      { value: 'month', label: '이번 달' },
      { value: 'all', label: '전체' },
    ],
  },
} satisfies Meta<typeof Segmented>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  render: function Render() {
    const [v, setV] = useState('week');
    return (
      <Segmented
        value={v}
        onChange={setV}
        options={[
          { value: 'week', label: '이번 주' },
          { value: 'month', label: '이번 달' },
          { value: 'all', label: '전체' },
        ]}
      />
    );
  },
};

/** 둘·셋·넷. 넷을 넘으면 세그먼트가 아니라 탭이나 목록이어야 한다. */
export const 칸수: Story = {
  render: function Render() {
    const [a, setA] = useState('mine');
    const [b, setB] = useState('week');
    const [d, setD] = useState('all');
    return (
      <Stack gap={sp[4]}>
        <Segmented
          value={a}
          onChange={setA}
          options={[
            { value: 'mine', label: '내 꿈' },
            { value: 'saved', label: '저장함' },
          ]}
        />
        <Segmented
          value={b}
          onChange={setB}
          options={[
            { value: 'week', label: '이번 주' },
            { value: 'month', label: '이번 달' },
            { value: 'all', label: '전체' },
          ]}
        />
        <Segmented
          value={d}
          onChange={setD}
          options={[
            { value: 'all', label: '전체' },
            { value: 'lucid', label: '자각몽' },
            { value: 'night', label: '악몽' },
            { value: 'etc', label: '기타' },
          ]}
        />
        <AppText size="caption" color={c.fgFaint}>
          칸을 바꿔도 옆 칸의 폭이 밀리지 않아야 한다
        </AppText>
      </Stack>
    );
  },
};
