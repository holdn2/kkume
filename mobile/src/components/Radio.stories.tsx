import type { Meta, StoryObj } from '@storybook/react-native';
import { useState } from 'react';

import { AppText } from '@shared/ui';
import { c, sp } from '@theme/token';

import { Radio } from './Radio';
import { Stack } from './layout';

const meta = {
  title: 'components/Radio',
  component: Radio,
  argTypes: { selected: { control: 'boolean' }, disabled: { control: 'boolean' } },
  args: { selected: true, label: '4컷', onSelect: () => {} },
} satisfies Meta<typeof Radio>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

/**
 * 만화 길이 고르기. 이건 **낮에 하는 결정**이라 라디오가 맞다 —
 * 새벽 흐름에 있었다면 선택지를 없애고 기본값으로 갔을 것이다(절대 규칙 7).
 */
export const 만화길이: Story = {
  render: function Render() {
    const [v, setV] = useState('4');
    return (
      <Stack gap={sp[1]}>
        <Radio selected={v === '4'} onSelect={() => setV('4')} label="4컷" description="짧게 요약된 만화" />
        <Radio selected={v === '8'} onSelect={() => setV('8')} label="8컷" description="장면이 더 이어진다" />
        <Radio selected={v === 'no'} onSelect={() => setV('no')} label="만들지 않기" description="글로만 남긴다" />
        <AppText size="caption" color={c.fgFaint}>
          원이 아니라 행 아무 데나 눌러도 선택돼야 한다
        </AppText>
      </Stack>
    );
  },
};

/** 선택된 행만 글자가 굵어진다. 배경은 건드리지 않는다. */
export const 비활성: Story = {
  render: () => (
    <Stack gap={sp[1]}>
      <Radio selected onSelect={() => {}} label="선택됨" />
      <Radio selected={false} onSelect={() => {}} label="선택 안 됨" />
      <Radio selected onSelect={() => {}} label="선택됐지만 못 바꿈" disabled />
      <Radio selected={false} onSelect={() => {}} label="고를 수 없음" disabled />
    </Stack>
  ),
};
