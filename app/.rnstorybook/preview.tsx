import type { Preview } from '@storybook/react-native';
import { View } from 'react-native';

import { c, sp } from '@theme/token';

// 컴포넌트를 흰 배경에서 보면 판단이 틀어진다. 이 앱은 다크 전용이고,
// 검수 기준이 "최소 밝기 실기기에서 보이는가"이므로 스토리북도 같은 바닥을 깐다.
const preview: Preview = {
  decorators: [
    (Story) => (
      <View style={{ flex: 1, backgroundColor: c.bg, padding: sp[5], justifyContent: 'center' }}>
        <Story />
      </View>
    ),
  ],
  parameters: {
    backgrounds: {
      default: 'bg',
      values: [
        { name: 'bg', value: c.bg },
        { name: 'night (RM-1)', value: c.night },
        { name: 'surface', value: c.surface },
        { name: 'card', value: c.card },
      ],
    },
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/,
      },
    },
  },
};

export default preview;
