import { ActivityIndicator, View } from 'react-native';

import { AppText } from '@shared/ui';
import { c, sp } from '@theme/token';

import { Button } from './Button';
import { Card } from './Card';
import { Stack } from './layout';
import { Skeleton } from './Skeleton';

/**
 * 화면이 아직 보여 줄 것이 없을 때의 세 모양 — 불러오는 중 · 못 불러옴 · 비어 있음(이슈 #129, 문서 095 C).
 *
 * 전에는 화면마다 달랐다. 불러오는 중이 문장 · 스피너 · 아무것도 없음 셋이었고, 오류는 다시 시도할 길이 있는 곳과
 * 없는 곳이 섞였다. 규칙은 하나다 —
 * - **목록**은 카드 모양의 자리(`ListSkeleton`)를 먼저 깐다. 무엇이 올지 모양으로 알려 준다
 * - **한 건짜리 화면**은 가운데 스피너(`Loading`)
 * - **못 불러왔으면** 이유와 「다시 불러오기」(`ErrorCard`), **비었으면** 다음에 할 일까지(`EmptyCard`)
 */

/** 한 건짜리 화면(꿈 상세 · 글 상세 · 만화)을 읽는 동안 */
export function Loading() {
  return <ActivityIndicator color={c.fgMuted} style={{ padding: sp[8] }} accessibilityLabel="불러오는 중" />;
}

/** 목록을 처음 읽는 동안. 카드 몇 장 모양을 먼저 깐다 */
export function ListSkeleton({ count = 3 }: { count?: number }) {
  return (
    <Stack gap={sp[3]}>
      {Array.from({ length: count }, (_, i) => (
        <Card key={i}>
          <Skeleton width="70%" height={18} />
          <Skeleton width="40%" height={12} />
        </Card>
      ))}
    </Stack>
  );
}

/** 목록 끝에서 다음 쪽을 읽는 동안. 이미 있는 줄 아래에 작게 */
export function MoreLoading() {
  return (
    <View style={{ padding: sp[4] }}>
      <ActivityIndicator color={c.fgMuted} />
    </View>
  );
}

/** 못 불러왔을 때. 이유와 다시 시도할 길을 함께 둔다 — 길이 없으면 앱을 껐다 켜는 수밖에 없다 */
export function ErrorCard({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <Card>
      <AppText size="body" color={c.danger}>
        {message}
      </AppText>
      {onRetry && <Button label="다시 불러오기" size="sm" variant="secondary" onPress={onRetry} />}
    </Card>
  );
}

/** 비어 있을 때. 한 줄로 끝내지 않고, 할 수 있는 일이 있으면 `hint`로 하나만 말한다 */
export function EmptyCard({ title, hint }: { title: string; hint?: string }) {
  return (
    <Card>
      <AppText size="body" color={c.fgMuted}>
        {title}
      </AppText>
      {!!hint && (
        <AppText size="caption" color={c.fgFaint}>
          {hint}
        </AppText>
      )}
    </Card>
  );
}
