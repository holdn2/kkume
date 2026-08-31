import type { Meta, StoryObj } from '@storybook/react-native';
import { useState } from 'react';

import { Input } from './Input';
import { Stack, Title } from './layout';
import { AppText } from '@shared/ui/AppText';
import { c, sp } from '@theme/token';

const meta = {
  title: 'components/Input',
  component: Input,
  argTypes: { multiline: { control: 'boolean' } },
  args: { label: '제목', placeholder: '무슨 꿈이었나요' },
} satisfies Meta<typeof Input>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

/**
 * 쉬는 상태에는 테두리가 없다. **포커스와 에러에만** 생긴다 —
 * 커서가 어디 있는지가 색이 아니라 형태로 읽혀야 새벽에도 보인다.
 * 실기기에서 실제로 탭해 보는 것이 판정이다.
 */
export const 상태: Story = {
  render: function Render() {
    const [v, setV] = useState('');
    return (
      <Stack gap={sp[4]}>
        <Input label="쉬는 상태" placeholder="탭하기 전" />
        <Input label="입력됨" value="바다 위를 걷는 꿈" onChangeText={() => {}} />
        <Input label="에러" value="ㄱ" onChangeText={setV} error="두 글자 이상 적어주세요" />
        <Input label="글자수" value={v} onChangeText={setV} maxLength={40} counter />
        <AppText size="caption" color={c.fgFaint}>
          탭했을 때 흰 테두리가 생기고 레이아웃이 밀리지 않아야 한다
        </AppText>
      </Stack>
    );
  },
};

/**
 * RM-1(새벽 기록)에서 실제로 쓰이는 모양.
 * **저장 버튼이 없다** — 이탈하면 자동 저장이다. 절대 규칙 7번.
 */
export const 새벽기록: Story = {
  render: function Render() {
    const [v, setV] = useState('');
    return (
      <Stack gap={sp[3]}>
        <Title sub="적다 말아도 그대로 남습니다">어떤 꿈이었나요</Title>
        <Input
          multiline
          value={v}
          onChangeText={setV}
          placeholder="기억나는 것부터"
          autoFocus={false}
        />
        <AppText size="caption" color={c.fgFaint}>
          저장 버튼이 없는 것이 맞다. 있으면 새벽에 결정이 하나 생긴다
        </AppText>
      </Stack>
    );
  },
};

/** 폼에서는 라벨을 거의 항상 준다. 값이 라벨보다 커야 값이 주인공이 된다. */
export const 폼: Story = {
  render: () => (
    <Stack gap={sp[4]}>
      <Title>기상 시각을 알려주세요</Title>
      <Input label="닉네임" value="uchan" onChangeText={() => {}} maxLength={12} counter />
      <Input label="한 줄 소개" placeholder="비워 두어도 됩니다" />
    </Stack>
  ),
};
