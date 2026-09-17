import { useRouter } from 'expo-router';

import { Button, Screen, Stack, Title } from '@components';
import { STORYBOOK_ENABLED } from '@shared/storybook';
import { AppText } from '@shared/ui';
import { c, sp } from '@theme/token';

// 스토리북은 라우트 하나로 붙인다. 앱 진입점을 갈아끼우는 방식보다
// 되돌리기 쉽고, 개발 중에 실제 화면과 오가며 볼 수 있다.
// 헤더는 _layout에서 이미 꺼져 있다.

/** 스토리북을 끈 번들(preview 빌드 · OTA)에서 이 자리에 들어오면 보이는 화면 */
function StorybookDisabled() {
  const router = useRouter();
  return (
    <Screen>
      <Title sub="이 빌드는 스토리북을 뺀 번들입니다">스토리북</Title>
      <Stack gap={sp[3]}>
        <AppText size="caption" color={c.fgMuted}>
          스토리북은 개발 빌드에서만 열립니다. 이 빌드에서 붙은 것을 확인하려면 빌드 진단을
          보세요.
        </AppText>
        <Button label="빌드 진단 열기" size="sm" onPress={() => router.replace('/diag')} />
        <Button label="닫기" size="sm" variant="ghost" onPress={() => router.back()} />
      </Stack>
    </Screen>
  );
}

/**
 * **꺼져 있으면 `.rnstorybook`을 아예 부르지 않는다.**
 *
 * 그 모듈은 불러오는 순간 `@storybook/react-native`의 `start()`를 실행한다.
 * 스토리북을 끈 번들에서는 `@storybook/*`가 빈 모듈이라 `start`가 없고, 부르면 곧바로 던져
 * 릴리스 앱이 꺼진다. `withStorybook`이 이 파일을 안내 화면으로 바꿔 줘야 하지만
 * Windows에서 번들을 만들면 그 바꿔치기가 안 먹는다(`@shared/storybook` 주석).
 * `import`는 파일 맨 위에서 무조건 평가되므로 조건부 `require`로 늦춘다
 */
const Storybook: React.ComponentType = STORYBOOK_ENABLED
  ? // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('../.rnstorybook').default
  : StorybookDisabled;

export default Storybook;
