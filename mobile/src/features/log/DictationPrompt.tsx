import { X } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';

import { Button, Card, Row } from '@components';
import { getDreamRepo, nowIso, SETTINGS } from '@shared/db';
import { askSpeechPermission, speechPermission } from '@shared/dictation';
import { AppText } from '@shared/ui';
import { c, sp } from '@theme/token';

/**
 * 「받아쓰기 켜기」 — 온보딩을 이미 지난 폰에 음성 인식 권한을 **낮에** 한 번 묻는 자리.
 *
 * 새벽 첫 녹음에서 권한 창이 뜨면 절대 규칙 7이라, 녹음 화면은 권한을 조회만 하고 없으면 녹음만 한다.
 * 그래서 누군가는 낮에 물어야 한다. **한 번만 띄운다** — 켜든 닫든 다시 안 뜬다.
 * 권한이 이미 정해졌거나 모듈이 없는 빌드면 아예 안 뜬다.
 *
 * 문구에 "녹음이 폰 밖으로 나가지 않는다"고 쓰지 않는다 — 녹음은 동기화로 서버(S3)에 백업된다.
 * 폰 안에서 하는 것은 **받아쓰기**다(047 권한 문구 초안이 이 점에서 틀렸다)
 */
export function DictationPrompt() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    let alive = true;
    void (async () => {
      if ((await speechPermission()) !== 'undetermined') return;
      const repo = await getDreamRepo();
      if (await repo.getSetting(SETTINGS.dictationAsked)) return;
      if (alive) setShow(true);
    })().catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const done = () => {
    setShow(false);
    void getDreamRepo()
      .then((repo) => repo.setSetting(SETTINGS.dictationAsked, nowIso()))
      .catch(() => {});
  };

  if (!show) return null;
  return (
    <Card>
      <Row gap={sp[2]}>
        <View style={{ flex: 1, gap: sp[1] }}>
          <AppText size="label" weight="semibold">
            말한 꿈을 글로 옮겨 둘까요
          </AppText>
          <AppText size="caption" color={c.fgMuted}>
            녹음하는 동안 폰 안에서 글로 받아써 둡니다. 받아쓰느라 소리를 다른 곳에 보내지 않습니다.
          </AppText>
        </View>
        <Pressable onPress={done} hitSlop={12} accessibilityRole="button" accessibilityLabel="닫기">
          <X size={18} strokeWidth={1.75} color={c.fgFaint} />
        </Pressable>
      </Row>
      <Button
        label="받아쓰기 켜기"
        size="sm"
        variant="secondary"
        onPress={() => {
          void askSpeechPermission().finally(done);
        }}
      />
    </Card>
  );
}
