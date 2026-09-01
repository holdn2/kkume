import { useRouter } from 'expo-router';

import { Button, Screen, Stack, Title } from '@components';
import { AppText } from '@shared/ui';
import { c, sp } from '@theme/token';

/**
 * REC-1. **낮에, 의식적으로** 여는 화면이다.
 *
 * 새벽 화면(`/record`)과 같은 "기록"이지만 사용자의 상태가 완전히 다르다.
 * 여기서는 기다리고 선택지를 보여준다 — 계획서 5.2의 결정이다.
 */
export default function QuickRecordScreen() {
  const router = useRouter();

  return (
    <Screen>
      <Title sub="말해도 되고 적어도 됩니다">무엇을 남길까요</Title>

      <Stack gap={sp[3]}>
        <Button label="말하기" onPress={() => router.push('/record?mode=voice')} haptic />
        <Button label="적기" variant="secondary" onPress={() => router.push('/record?mode=text')} />
      </Stack>

      <AppText size="caption" color={c.fgFaint}>
        새벽에는 잠금화면에서 바로 열립니다. 이 화면을 거치지 않습니다
      </AppText>
    </Screen>
  );
}
