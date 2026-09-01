import type { Meta, StoryObj } from '@storybook/react-native';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { AppText } from '@shared/ui';
import { c, sp } from '@theme/token';

import { Button } from './Button';
import { Toast } from './Toast';
import { Stack } from './layout';

const meta = {
  title: 'components/Toast',
  component: Toast,
  argTypes: { tone: { control: 'select', options: ['neutral', 'running', 'danger'] } },
  args: { visible: true, message: '기록을 삭제했습니다', tone: 'neutral', actionLabel: '되돌리기' },
} satisfies Meta<typeof Toast>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  render: (args) => (
    <View style={{ height: 200 }}>
      <Toast {...args} />
    </View>
  ),
};

/** 세 톤. 색이 보이면 상태라는 규칙이 여기서도 그대로다. */
export const 톤: Story = {
  render: () => (
    <View style={{ height: 260 }}>
      <Stack gap={sp[3]}>
        <View style={{ height: 60 }}>
          <Toast visible message="기록을 삭제했습니다" actionLabel="되돌리기" />
        </View>
        <View style={{ height: 60 }}>
          <Toast visible message="만화를 만들고 있어요" tone="running" />
        </View>
        <View style={{ height: 60 }}>
          <Toast visible message="동기화에 실패했습니다" tone="danger" actionLabel="다시" />
        </View>
      </Stack>
    </View>
  ),
};

/**
 * **언제 사라지는지는 부르는 쪽이 정한다.** 여기서는 3초 뒤에 끈다.
 * 되돌리기가 붙은 토스트는 더 오래 떠 있어야 하는데,
 * 시간을 컴포넌트에 박으면 그 구분이 없어진다.
 */
export const 나타났다사라짐: Story = {
  render: function Render() {
    const [on, setOn] = useState(false);

    useEffect(() => {
      if (!on) return;
      const t = setTimeout(() => setOn(false), 3000);
      return () => clearTimeout(t);
    }, [on]);

    return (
      <View style={{ height: 260, justifyContent: 'center' }}>
        <Stack gap={sp[3]}>
          <Button label="토스트 띄우기" onPress={() => setOn(true)} />
          <AppText size="caption" color={c.fgFaint}>
            아래에서 올라왔다가 3초 뒤에 사라진다
          </AppText>
        </Stack>
        <Toast visible={on} message="기록을 삭제했습니다" actionLabel="되돌리기" onAction={() => setOn(false)} />
      </View>
    );
  },
};
