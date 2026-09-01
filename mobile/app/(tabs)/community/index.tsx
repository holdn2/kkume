import { Screen, Title } from '@components';
import { AppText } from '@shared/ui';
import { c } from '@theme/token';

/** COM-1. 7~8주차 */
export default function CommunityScreen() {
  return (
    <Screen scroll>
      <Title>둘러보기</Title>
      <AppText color={c.fgMuted}>다른 사람의 꿈은 7주차부터 보입니다.</AppText>
    </Screen>
  );
}
