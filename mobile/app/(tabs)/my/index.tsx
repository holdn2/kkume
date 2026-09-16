import { useRouter } from 'expo-router';
import { LayoutGrid } from 'lucide-react-native';

import { Button, Card, ListRow, Row, Screen, Stack, Title } from '@components';
import { useAuth } from '@shared/auth';
import { AppText } from '@shared/ui';
import { c, sp } from '@theme/token';

/** MY-1. 11주차에 실제로 채운다 */
export default function MyScreen() {
  const router = useRouter();
  const auth = useAuth();

  return (
    <Screen scroll>
      <Title>마이</Title>

      {/* **로그인이 여기 있는 이유.** 새벽 흐름에는 로그인을 두지 않는다 —
          위젯을 눌렀는데 로그인 화면이 뜨면 그 기록이 사라진다(절대 규칙 1).
          로그인은 낮에 마이 탭에서 스스로 하는 일이고, 그 전까지 기록은
          `user_id`가 빈 채로 로컬에 쌓인다. 로그인해야 동기화가 붙는다 */}
      <Card>
        {auth.loading ? (
          <AppText size="caption" color={c.fgFaint}>
            불러오는 중입니다
          </AppText>
        ) : auth.session ? (
          <Stack gap={sp[3]}>
            <Row gap={sp[2]}>
              <AppText size="label" weight="semibold" style={{ flex: 1 }}>
                {auth.session.user.nickname}
              </AppText>
            </Row>
            <AppText size="caption" color={c.fgFaint}>
              기록이 서버에 함께 보관됩니다
            </AppText>
            <Button
              label="로그아웃"
              variant="ghost"
              size="sm"
              loading={auth.busy}
              onPress={() => void auth.signOut()}
            />
          </Stack>
        ) : (
          <Stack gap={sp[3]}>
            <AppText size="label" weight="semibold">
              로그인하지 않아도 기록은 됩니다
            </AppText>
            <AppText size="caption" color={c.fgFaint}>
              로그인하면 기기를 바꿔도 기록이 따라옵니다.
            </AppText>
            <Button
              label="구글로 계속하기"
              loading={auth.busy}
              onPress={() => void auth.signIn()}
            />
          </Stack>
        )}

        {!!auth.error && (
          <AppText size="caption" color={c.danger} style={{ marginTop: sp[3] }}>
            {auth.error}
          </AppText>
        )}
      </Card>

      <Stack gap={sp[3]}>
        {/* 온보딩에서 건너뛴 사람이 돌아오는 자리다. ON-7은 최대 이탈 지점이라
            다시 열 길이 없으면 위젯 없이 쓰는 사용자가 그대로 남는다 */}
        <ListRow
          icon={LayoutGrid}
          label="잠금화면 위젯 설치"
          onPress={() => router.push('/onboarding?step=widget')}
          highlight
        />
      </Stack>

      {/* "기상 시각"과 "기상 알림"이 여기 있었다. 만들다 만 것이 아니라
          **안 하기로 한 것**이라 지운다.
          진입점을 위젯 하나로 좁히면서(2026-09-01) 고정 알림을 뺐고,
          기상 시각은 그 알림을 언제 다시 올릴지 알기 위한 값이었다(문서 009).
          알림 자체가 없어지자 근거가 같이 사라졌다.
          LOG-3 유도 알림을 붙이는 4주차 이후에 그 문맥으로 다시 들어온다. */}

      <Stack gap={sp[3]}>
        <AppText size="caption" color={c.fgFaint}>
          개발용
        </AppText>
        <ListRow label="스토리북 열기" onPress={() => router.push('/storybook')} />
        {/* 스토리북은 preview 빌드에서 꺼진다. 정작 판정이 필요한 빌드라 진단은 따로 둔다 */}
        <ListRow label="빌드 진단" onPress={() => router.push('/diag')} />
      </Stack>

      <AppText size="caption" color={c.fgFaint}>
        프로필과 알림 설정은 뒤에 들어옵니다
      </AppText>
    </Screen>
  );
}
