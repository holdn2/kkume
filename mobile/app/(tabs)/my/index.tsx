import { useRouter } from 'expo-router';
import { LayoutGrid, Clock, Bell } from 'lucide-react-native';

import { ListRow, Screen, Stack, Title } from '@components';
import { AppText } from '@shared/ui';
import { c, sp } from '@theme/token';

/** MY-1. 11주차에 실제로 채운다 */
export default function MyScreen() {
  const router = useRouter();

  return (
    <Screen scroll>
      <Title>마이</Title>

      <Stack gap={sp[3]}>
        <ListRow icon={LayoutGrid} label="잠금화면 위젯 설치" onPress={() => {}} highlight />
        <ListRow icon={Clock} label="기상 시각" value="07:00" onPress={() => {}} />
        <ListRow icon={Bell} label="기상 알림" value="꺼짐" onPress={() => {}} />
      </Stack>

      <Stack gap={sp[3]}>
        <AppText size="caption" color={c.fgFaint}>
          개발용
        </AppText>
        <ListRow label="스토리북 열기" onPress={() => router.push('/storybook')} />
        {/* 스토리북은 preview 빌드에서 꺼진다. 정작 판정이 필요한 빌드라 진단은 따로 둔다 */}
        <ListRow label="빌드 진단" onPress={() => router.push('/diag')} />
      </Stack>

      <AppText size="caption" color={c.fgFaint}>
        위 항목은 아직 눌러도 아무 일이 없습니다
      </AppText>
    </Screen>
  );
}
