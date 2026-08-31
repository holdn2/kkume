import type { Meta, StoryObj } from '@storybook/react-native';
import { Bell, Clock, LayoutGrid, Trash2, UserRound } from 'lucide-react-native';
import { View } from 'react-native';

import { ListRow } from './ListRow';
import { AppText } from '@shared/ui/AppText';
import { c, sp } from '@theme/token';

const meta = {
  title: 'components/ListRow',
  component: ListRow,
  argTypes: {
    danger: { control: 'boolean' },
    highlight: { control: 'boolean' },
  },
  args: { label: '기상 시각', value: '07:00' },
} satisfies Meta<typeof ListRow>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

/** 마이페이지에 실제로 놓일 모양. 최소 높이 48이 지켜지는지 본다. */
export const 설정목록: Story = {
  render: () => (
    <View style={{ gap: sp[1] }}>
      <ListRow icon={Clock} label="기상 시각" value="07:00" onPress={() => {}} />
      <ListRow icon={Bell} label="알림" value="켜짐" onPress={() => {}} />
      <ListRow icon={UserRound} label="프로필" onPress={() => {}} />
      <View style={{ height: sp[3] }} />
      <ListRow icon={LayoutGrid} label="잠금화면 위젯 설치" onPress={() => {}} highlight />
      <View style={{ height: sp[3] }} />
      <ListRow icon={Trash2} label="계정 삭제" onPress={() => {}} danger />
    </View>
  ),
};

/**
 * `onPress`가 없으면 화살표를 그리지 않는다.
 * 누를 수 있는지 없는지가 화살표 하나로 구분돼야 한다.
 */
export const 꿈목록: Story = {
  render: () => (
    <View style={{ gap: sp[1] }}>
      {[
        ['바다 위를 걷는 꿈', '파도 소리가 계속 들렸고 발이 안 젖었다', '05:12'],
        ['이빨이 빠지는 꿈', '거울을 보는데 앞니가 하나씩', '06:40'],
        ['아주 긴 복도', '끝이 안 보이는데 계속 걸었다', '05:55'],
      ].map(([t, s2, at]) => (
        <ListRow key={t} label={t} subtitle={s2} value={at} onPress={() => {}} />
      ))}
      <AppText size="caption" color={c.fgFaint}>
        구분선이 없다. 여백과 굵기만으로 행이 나뉘는지 본다
      </AppText>
    </View>
  ),
};

export const 누를수없는행: Story = {
  render: () => (
    <View style={{ gap: sp[2] }}>
      <ListRow icon={Clock} label="앱 버전" value="1.0.0" />
      <ListRow icon={Bell} label="누를 수 있는 행" value="1.0.0" onPress={() => {}} />
      <AppText size="caption" color={c.fgFaint}>
        아래 행에만 오른쪽 화살표가 있다
      </AppText>
    </View>
  ),
};
