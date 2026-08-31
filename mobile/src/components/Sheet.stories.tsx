import type { Meta, StoryObj } from '@storybook/react-native';
import { useState } from 'react';

import { Button } from './Button';
import { Radio } from './Radio';
import { Sheet } from './Sheet';
import { Stack } from './layout';
import { AppText } from '@shared/ui/AppText';
import { c, sp } from '@theme/token';

const meta = {
  title: 'components/Sheet',
  component: Sheet,
  // Controls용이 아니다. 아래 스토리들이 args를 받지 않아 패널은 뜨지 않는다.
  // `satisfies Meta`가 필수 prop의 기본값을 요구해서 남겨 둔 것이니 지우지 말 것.
  args: { visible: false, onClose: () => {} },
} satisfies Meta<typeof Sheet>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * 되돌릴 수 없는 것에는 **손이 한 번 더 들게** 한다.
 * 비활성 버튼이 채운 회색이라 "아직 못 누른다"가 형태로 보인다.
 */
export const 삭제확인: Story = {
  render: function Render() {
    const [open, setOpen] = useState(false);
    return (
      <Stack gap={sp[3]}>
        <Button label="계정 삭제" variant="danger" onPress={() => setOpen(true)} />
        <AppText size="caption" color={c.fgFaint}>
          시트 밖(어두운 곳)을 눌러도 닫혀야 한다
        </AppText>

        <Sheet
          visible={open}
          onClose={() => setOpen(false)}
          title="계정을 삭제할까요"
          description="기록 47개와 만화 12개가 함께 사라집니다. 되돌릴 수 없습니다.">
          <Button label="삭제하기" variant="danger" disabled onPress={() => {}} />
          <Button label="그만두기" variant="ghost" size="sm" onPress={() => setOpen(false)} />
        </Sheet>
      </Stack>
    );
  },
};

/** 고르는 시트. 낮에 하는 결정이라 선택지를 둘 수 있다. */
export const 선택시트: Story = {
  render: function Render() {
    const [open, setOpen] = useState(false);
    const [v, setV] = useState('4');
    return (
      <Stack gap={sp[3]}>
        <Button label="만화 길이 고르기" variant="secondary" onPress={() => setOpen(true)} />

        <Sheet visible={open} onClose={() => setOpen(false)} title="몇 컷으로 만들까요">
          <Radio selected={v === '4'} onSelect={() => setV('4')} label="4컷" description="짧게 요약된 만화" />
          <Radio selected={v === '8'} onSelect={() => setV('8')} label="8컷" description="장면이 더 이어진다" />
          <Button label="이걸로 만들기" onPress={() => setOpen(false)} haptic />
        </Sheet>
      </Stack>
    );
  },
};
