import { useRouter } from 'expo-router';
import { useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';

import { Avatar, Button, Card, Header, Row, Screen } from '@components';
import { setBlocked, useBlocked, useInvalidateCommunity, useMe, useRefetchOnFocus } from '@features/community';
import type { Author } from '@shared/api/community';
import { AppText } from '@shared/ui';
import { c, hit, sp } from '@theme/token';

/**
 * 차단한 사용자 — 마이 탭에서 들어온다(계획서 001 마이페이지 · 보고서 053 8장 "차단 목록").
 *
 * 전에는 그 사람의 프로필까지 찾아가야 차단을 풀 수 있었다. 차단 목록은 서버에 있고(056 04장 1)
 * `useBlocked`가 커뮤니티 캐시로 들고 있어서, 풀면 캐시를 무효로 해 피드 · 댓글에 그 사람이 다시 보인다.
 */
export default function BlocksScreen() {
  const router = useRouter();
  const me = useMe();
  const meId = me === undefined ? undefined : (me?.id ?? null);
  const blocked = useBlocked(meId);
  const invalidate = useInvalidateCommunity();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useRefetchOnFocus(blocked.reload, true);

  const unblock = (user: Author) => {
    if (busy) return;
    setBusy(user.id);
    setError(null);
    setBlocked(user, false)
      .then(() => invalidate())
      .catch((e) => setError(e?.message ?? '차단을 풀지 못했습니다'))
      .finally(() => setBusy(null));
  };

  return (
    <Screen header={<Header title="차단한 사용자" onBack={() => router.back()} />}>
      <AppText size="caption" color={c.fgFaint}>
        차단하면 그 사람의 글과 댓글이 꿈 나눔에서 보이지 않습니다. 상대에게는 알리지 않습니다.
      </AppText>

      {!!error && (
        <AppText size="caption" color={c.danger}>
          {error}
        </AppText>
      )}

      {me === null ? (
        <Card>
          <AppText size="body" color={c.fgMuted}>
            로그인하면 차단 목록을 볼 수 있습니다.
          </AppText>
        </Card>
      ) : (
        <FlatList
          data={blocked.list}
          keyExtractor={(u) => u.id}
          renderItem={({ item }) => (
            <Row gap={sp[3]} style={s.row}>
              <Avatar name={item.nickname} />
              <AppText size="body" numberOfLines={1} style={{ flex: 1 }}>
                {item.nickname}
              </AppText>
              <Button
                label={busy === item.id ? '푸는 중' : '차단 풀기'}
                size="sm"
                variant="secondary"
                disabled={busy !== null}
                onPress={() => unblock(item)}
              />
            </Row>
          )}
          ItemSeparatorComponent={() => <View style={{ height: sp[2] }} />}
          contentContainerStyle={{ paddingBottom: sp[8] }}
          ListEmptyComponent={
            me === undefined ? null : (
              <Card>
                <AppText size="body" color={c.fgMuted}>
                  차단한 사용자가 없습니다.
                </AppText>
              </Card>
            )
          }
        />
      )}
    </Screen>
  );
}

const s = StyleSheet.create({
  row: { minHeight: hit.min },
});
