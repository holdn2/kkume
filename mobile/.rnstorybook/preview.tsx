import type { Preview } from '@storybook/react-native';
import { ScrollView } from 'react-native';

import { c, sp } from '@theme/token';

// 컴포넌트를 흰 배경에서 보면 판단이 틀어진다. 이 앱은 다크 전용이고,
// 검수 기준이 "최소 밝기 실기기에서 보이는가"이므로 스토리북도 같은 바닥을 깐다.
//
// backgrounds 파라미터는 웹 스토리북 애드온이라 온디바이스에는 UI가 없다.
// 배경 단계 확인은 theme/토큰의 '배경단계' 스토리에서 직접 겹쳐 보여준다.
const preview: Preview = {
  // 세로로 긴 스토리(목록 · 폼)가 잘리면 그 자리에서 판정이 불가능해진다.
  // ScrollView + flexGrow로 짧은 스토리는 그대로 가운데 오고 긴 것만 스크롤된다.
  decorators: [
    (Story) => (
      <ScrollView
        style={{ flex: 1, backgroundColor: c.bg }}
        contentContainerStyle={{ flexGrow: 1, padding: sp[5], justifyContent: 'center' }}>
        <Story />
      </ScrollView>
    ),
  ],
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/,
      },
    },
  },
};

export default preview;
