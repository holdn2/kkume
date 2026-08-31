import type { Meta, StoryObj } from '@storybook/react-native';
import { useEffect, useState } from 'react';

import { AppText } from '@shared/ui';
import { c, sp } from '@theme/token';

import { Segmented } from './Segmented';
import { Stack } from './layout';

const meta = {
  title: 'components/Segmented',
  component: Segmented,
  // value에 select를 걸어 둔다. 이 컴포넌트는 value가 제네릭이라
  // Storybook이 유니온을 알 수 없고, argTypes가 없으면 자유 입력 칸이 된다.
  argTypes: { value: { control: 'select', options: ['week', 'month', 'all'] } },
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

/**
 * `render`가 args를 받아야 Controls 패널이 뜬다(`__isArgsStory`).
 * 동시에 눌러서도 바뀌어야 하므로 args를 초기값으로 쓰고 내부 상태를 따로 둔다.
 */
export const Playground: Story = {
  render: function Render(args) {
    const [v, setV] = useState(args.value);
    useEffect(() => setV(args.value), [args.value]);
    return <Segmented {...args} value={v} onChange={setV} />;
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
