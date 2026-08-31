import { Screen, Title } from '@components';
import { AppText } from '@shared/ui';
import { c } from '@theme/token';

/** LOG-1. 4주차에 실제 목록으로 채운다 */
export default function LogScreen() {
  return (
    <Screen scroll>
      <Title sub="아직 비어 있습니다">이번 주 꿈</Title>
      <AppText color={c.fgMuted}>
        기록이 쌓이면 여기 목록으로 보입니다.
      </AppText>
    </Screen>
  );
}
