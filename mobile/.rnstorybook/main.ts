import type { StorybookConfig } from '@storybook/react-native';

// 005 9장대로 스토리는 컴포넌트 옆에 둔다. 별도 폴더로 빼면
// 컴포넌트를 고칠 때 스토리를 같이 안 고치게 된다.
const main: StorybookConfig = {
  // 폴더마다 한 줄씩 늘리다 보면 새로 만든 폴더의 스토리가 조용히 빠진다.
  // src 아래 전부를 잡고, 어디에 두든 컴포넌트 옆이기만 하면 되게 한다.
  stories: ['../src/**/*.stories.?(ts|tsx|js|jsx)'],
  deviceAddons: ['@storybook/addon-ondevice-controls', '@storybook/addon-ondevice-actions'],
};

export default main;
