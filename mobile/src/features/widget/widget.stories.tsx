import type { Meta, StoryObj } from '@storybook/react-native';
import { useRouter } from 'expo-router';
import { useState } from 'react';

import { Badge, Button, Card, Row, Stack } from '@components';
import { AppText } from '@shared/ui';
import { c, sp } from '@theme/token';

import { ensureWidgetSnapshot, widgetBackend } from './index';

const meta = { title: 'features/위젯' } satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * **위젯이 실제로 붙었는지 여기서 판정한다.**
 *
 * `없음`이면 지금 빌드에 `ExpoWidgets`가 없다는 뜻이고, 그 상태에서는
 * 잠금화면에 위젯을 추가할 수조차 없다. `expo-widgets`가 들어간
 * `preview` 빌드에서만 `expo-widgets`가 뜬다.
 *
 * 아래 두 버튼은 **위젯이 여는 것과 똑같은 딥링크**로 이동한다.
 * 잠금화면 없이 화면 쪽 배선만 먼저 확인하는 용도다 —
 * 진짜 판정은 잠긴 화면에서 위젯을 눌러 콜드 스타트로 들어오는 것이다.
 */
export const 위젯점검: Story = {
  render: function Render() {
    const router = useRouter();
    const [snapshot, setSnapshot] = useState<string | null>(null);
    const backend = widgetBackend();

    return (
      <Stack gap={sp[4]}>
        <Row>
          <AppText size="label" weight="semibold" style={{ flex: 1 }}>
            위젯 모듈
          </AppText>
          {backend === 'expo-widgets' ? (
            <Badge label="expo-widgets" tone="neutral" />
          ) : (
            <Badge label="없음 — 빌드에 안 들어감" tone="warning" />
          )}
        </Row>

        <Card>
          <AppText size="caption" color={c.fgFaint}>
            위젯이 여는 것과 같은 딥링크입니다. 왼쪽이 잠금화면 위젯의 왼쪽 절반,
            오른쪽이 오른쪽 절반에 해당합니다.
          </AppText>
        </Card>

        <Row gap={sp[2]}>
          <Button label="말하기로 진입" size="sm" onPress={() => router.push('/record?mode=voice&from=widget')} />
          <Button
            label="적기로 진입"
            size="sm"
            variant="secondary"
            onPress={() => router.push('/record?mode=text&from=widget')}
          />
        </Row>

        <Button
          label="스냅샷 다시 그리기"
          size="sm"
          variant="ghost"
          onPress={() => {
            ensureWidgetSnapshot();
            setSnapshot(new Date().toLocaleTimeString());
          }}
        />

        <AppText size="caption" color={c.fgFaint}>
          {snapshot
            ? `${snapshot}에 스냅샷을 걸었다. 잠금화면 위젯이 비어 있었다면 이걸로 채워진다`
            : '위젯이 빈 칸으로 뜨면 스냅샷이 없는 것이다. 한 번 눌러본다'}
        </AppText>
      </Stack>
    );
  },
};
