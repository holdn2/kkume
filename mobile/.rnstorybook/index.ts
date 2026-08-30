import AsyncStorage from '@react-native-async-storage/async-storage';

// storybook.requires.ts는 metro가 기동할 때 withStorybook이 생성한다.
// 저장소에 없는 것이 정상이며, git에도 올리지 않는다.
import { view } from './storybook.requires';

const StorybookUIRoot = view.getStorybookUI({
  // 마지막으로 보던 스토리를 기억해 둔다. 컴포넌트 하나를 고치며
  // 앱을 여러 번 다시 여는 작업이라 매번 찾아 들어가면 시간이 샌다.
  storage: {
    getItem: AsyncStorage.getItem,
    setItem: AsyncStorage.setItem,
  },
});

export default StorybookUIRoot;
