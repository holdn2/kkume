import { Redirect } from 'expo-router';
import { useEffect, useState } from 'react';

import { getDreamRepo, SETTINGS } from '@shared/db';

/**
 * ON-1. **화면이 아니라 분기다.**
 *
 * 온보딩을 끝냈으면 꿈로그로, 아니면 온보딩으로 보낸다.
 * 탭 그룹에 index를 두지 않아야 각 탭이 자기 폴더(log · community · quick · my)를 그대로 갖는다.
 *
 * **딥링크는 여기를 안 지난다.** 잠금화면 위젯이 여는 `kkume://record`는 `app/record.tsx`로
 * 바로 들어가므로, 온보딩을 안 끝냈어도 새벽 기록이 막히지 않는다. 그게 맞다 —
 * 기록을 막는 온보딩은 이 앱에서 가장 나쁜 것이다.
 */
export default function Index() {
  const [done, setDone] = useState<boolean | null>(null);

  useEffect(() => {
    let alive = true;
    getDreamRepo()
      .then((repo) => repo.getSetting(SETTINGS.onboardedAt))
      .then((v) => alive && setDone(v != null))
      // 저장소를 못 열면 온보딩을 보여준다. 한 번 더 보는 쪽이,
      // 아직 안 본 사람이 그냥 빈 목록으로 떨어지는 쪽보다 낫다
      .catch(() => alive && setDone(false));
    return () => {
      alive = false;
    };
  }, []);

  if (done === null) return null;
  return <Redirect href={done ? '/log' : '/onboarding'} />;
}
