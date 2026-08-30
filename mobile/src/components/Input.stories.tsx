import type { Meta, StoryObj } from '@storybook/react-native';
import { View } from 'react-native';

import { Input } from './Input';
import { AppText } from '@shared/ui/AppText';
import { c, sp } from '@theme/token';

const meta = {
  title: 'components/Input',
  component: Input,
  argTypes: {
    multiline: { control: 'boolean' },
    editable: { control: 'boolean' },
  },
  args: { placeholder: '꿈 내용을 적어보세요…' },
} satisfies Meta<typeof Input>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

/** 포커스하면 테두리가 보라로, 에러가 있으면 장미색으로 바뀐다. 에러가 포커스를 이긴다. */
export const States: Story = {
  render: () => (
    <View style={{ gap: sp[4] }}>
      <View style={{ gap: sp[1] }}>
        <AppText size="caption" color={c.fgFaint}>
          비어 있음 — placeholder는 fgDisabled다
        </AppText>
        <Input placeholder="닉네임" />
      </View>
      <View style={{ gap: sp[1] }}>
        <AppText size="caption" color={c.fgFaint}>
          값이 들어감
        </AppText>
        <Input defaultValue="바다 위를 걷는 꿈" />
      </View>
      <View style={{ gap: sp[1] }}>
        <AppText size="caption" color={c.fgFaint}>
          에러
        </AppText>
        <Input defaultValue="꾸메" error="이미 사용 중인 닉네임이에요" />
      </View>
    </View>
  ),
};

/** RM-1에서 쓰는 모양. 저장 버튼이 없는 것이 정상이다 — 이탈하면 자동 저장이다. */
export const Textarea: Story = {
  render: () => (
    <View style={{ gap: sp[2] }}>
      <Input multiline placeholder="꿈 내용을 적어보세요…" />
      <AppText size="caption" color={c.fgFaint}>
        최소 높이 120. 새벽에 한 줄만 적어도 입력창이 작아 보이지 않아야 한다
      </AppText>
    </View>
  ),
};
