import { useEffect, useState } from 'react';

import { Card } from '@components';
import { getDreamRepo, storageFailed } from '@shared/db';
import { AppText } from '@shared/ui';
import { c } from '@theme/token';

/**
 * 기기 저장소(SQLite)를 열지 못해 메모리에 저장하고 있을 때만 뜬다(문서 104 S1, 이슈 #167).
 * 조용히 넘어가면 사용자는 저장된 줄 알고, 앱을 닫는 순간 그 세션의 기록이 사라진다.
 *
 * `compact` 는 새벽 녹음 화면용이다 — 읽을 것을 한 줄로 줄이고 할 일은 주지 않는다(절대 규칙 7).
 */
export function StorageWarning({ compact }: { compact?: boolean }) {
  const [bad, setBad] = useState(false);
  useEffect(() => {
    let alive = true;
    getDreamRepo()
      .then(() => alive && setBad(storageFailed()))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  if (!bad) return null;
  if (compact) {
    return (
      <AppText size="caption" color={c.warning} style={{ textAlign: 'center' }}>
        기기 저장소를 열지 못해, 앱을 닫으면 이 기록이 사라질 수 있어요
      </AppText>
    );
  }
  return (
    <Card>
      <AppText size="label" weight="semibold" color={c.warning}>
        기기 저장소를 열지 못했어요
      </AppText>
      <AppText size="caption" color={c.fgMuted}>
        지금 남기는 기록은 앱을 닫으면 사라질 수 있어요. 남긴 내용은 다른 곳에 옮겨 적어 두고, 앱을 다시 열어 주세요. 계속되면
        기기 저장 공간이 넉넉한지 확인해 주세요.
      </AppText>
    </Card>
  );
}
