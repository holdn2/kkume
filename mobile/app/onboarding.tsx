import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';

import { Button, Progress, Screen, Stack } from '@components';
import { InstallWidget, Rehearsal, Value } from '@features/onboarding/steps';
import { getDreamRepo, nowIso, SETTINGS } from '@shared/db';
import { AppText } from '@shared/ui';
import { c, sp } from '@theme/token';

/**
 * 온보딩. **낮에 한 번 지나가는 길이다.**
 *
 * 계획서의 ON-1~ON-7 중 넷만 있다. 나머지 셋은 자리를 비워 둔 것이 아니라
 * 지금 만들 이유가 없어졌거나 아직 재료가 없다.
 *
 * - **ON-1 스플래시** — 화면이 아니라 분기다. `app/index.tsx`가 한다
 * - **ON-3 소셜 로그인** — 5주차. 카카오·구글 네이티브가 아직 없다.
 *   여기 `steps` 사이에 한 장으로 들어온다
 * - **ON-4 알림 권한** — 진입점이 위젯 하나로 좁혀지면서(2026-09-01 결정)
 *   알림이 새벽 기록과 무관해졌다. 남은 용도는 4주차 LOG-3 유도와 만화 완료 알림이라
 *   **그 문맥에서 물어보는 편이 낫다.** 쓰지도 않을 권한을 미리 받으면 여기서 이탈한다
 * - **ON-5 기상 시각** — 이 값은 Android 고정 알림을 언제 다시 올릴지 알기 위한
 *   필수 입력이었다(문서 009). 고정 알림을 안 쓰기로 해서 근거가 사라졌다.
 *   LOG-3 유도 알림을 붙일 때 다시 필요해진다
 */
const STEPS = ['value', 'rehearsal', 'widget'] as const;

export default function Onboarding() {
  const router = useRouter();
  /**
   * 마이페이지에서 `?step=widget`으로 들어오면 **위젯 설치 장만** 연다.
   *
   * 온보딩을 처음부터 다시 보여주면, 위젯 설치법 하나 보러 온 사람에게
   * 가치 소개와 리허설을 다시 시킨다. 그건 안내가 아니라 통행세다.
   */
  const { step: entry } = useLocalSearchParams<{ step?: string }>();
  const guideOnly = entry === 'widget';

  const [step, setStep] = useState(guideOnly ? STEPS.indexOf('widget') : 0);
  const [error, setError] = useState<string | null>(null);

  const last = step === STEPS.length - 1;

  /**
   * 끝냈다고 남기고 나간다. **남기지 못해도 내보낸다** —
   * 저장이 안 된다고 온보딩에 가두면 앱을 아예 못 쓴다. 다음에 한 번 더 보게 될 뿐이다.
   */
  const finish = () => {
    void (async () => {
      try {
        const repo = await getDreamRepo();
        await repo.setSetting(SETTINGS.onboardedAt, nowIso());
      } catch (e) {
        setError(String(e));
      }
      router.replace('/log');
    })();
  };

  // 안내만 보러 온 것이면 완료 표시를 건드리지 않고 왔던 곳으로 돌아간다
  const next = () => (guideOnly ? router.back() : last ? finish() : setStep((n) => n + 1));

  return (
    <Screen>
      <Stack gap={sp[5]} style={{ flex: 1 }}>
        {/* 몇 장 남았는지만 보이면 된다. 숫자는 쓰지 않는다 — Progress가 안 쓰는 것과 같은 이유다.
            안내만 보러 온 화면에는 진행 막대가 없다. 갈 길이 없으니 남은 길도 없다 */}
        {!guideOnly && <Progress value={(step + 1) / STEPS.length} />}

        <Stack gap={sp[5]} style={{ flex: 1 }}>
          {STEPS[step] === 'value' && <Value />}
          {/* 리허설은 자기 버튼으로 넘어간다. 녹음을 안 해 보고 지나가면 이 장의 의미가 없다 */}
          {STEPS[step] === 'rehearsal' && <Rehearsal onDone={next} />}
          {STEPS[step] === 'widget' && <InstallWidget />}
        </Stack>

        {!!error && (
          <AppText size="caption" color={c.danger}>
            {error}
          </AppText>
        )}

        {STEPS[step] !== 'rehearsal' && (
          <Button label={guideOnly ? '닫기' : last ? '위젯을 올렸습니다' : '다음'} onPress={next} />
        )}

        {/* 건너뛰기는 온보딩의 마지막 장에만 둔다. 위젯을 지금 못 올리는 상황이 실제로 있고,
            막으면 앱을 아예 못 쓴다. 마이페이지에서 다시 열 수 있다 */}
        {last && !guideOnly && (
          <Button label="나중에 하기" variant="ghost" onPress={finish} />
        )}
      </Stack>
    </Screen>
  );
}
