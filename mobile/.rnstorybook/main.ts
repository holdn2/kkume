import type { StorybookConfig } from '@storybook/react-native';

// 005 9장대로 스토리는 컴포넌트 옆에 둔다. 별도 폴더로 빼면
// 컴포넌트를 고칠 때 스토리를 같이 안 고치게 된다.
const main: StorybookConfig = {
  stories: [
    '../src/components/**/*.stories.?(ts|tsx|js|jsx)',
    '../src/shared/ui/**/*.stories.?(ts|tsx|js|jsx)',
    '../src/theme/**/*.stories.?(ts|tsx|js|jsx)',
  ],
  deviceAddons: ['@storybook/addon-ondevice-controls', '@storybook/addon-ondevice-actions'],
};

export default main;
