import { useFocusEffect, useRouter } from 'expo-router';
import { Plus } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';

import { Button, Card, Screen, Segmented, Title } from '@components';
import { getCommunityApi, useBlocked, useMe } from '@features/community';
import { PostCard } from '@features/community/PostCard';
import type { PostSummary } from '@shared/api/community';
import { AppText } from '@shared/ui';
import { c, hit, press, r, sp } from '@theme/token';

type Tab = 'feed' | 'mine';
const TABS = [
  { value: 'feed', label: '피드' },
  { value: 'mine', label: '내 글' },
] as const;

/**
 * COM-1. 해몽 요청 피드.
 *
 * **"내 글"은 탭이 아니라 내 프로필(COM-4)로 가는 문이다**(계획서 003) — 내 글 목록을 두 곳에
 * 두면 중복이라 프로필 화면 하나로 합쳤다. 그래서 세그먼트를 눌러도 값은 늘 "피드"로 남는다.
 *
 * **차단한 사람의 글은 여기서 거른다**(계획서 001 — 앱에서 거름). 서버에 둘지는 문서 049에서 묻는다.
 * 지금은 가짜 서버가 답한다(`@features/community/fake`).
 */
export default function CommunityScreen() {
  const router = useRouter();
  const me = useMe();
  const blocked = useBlocked();
  const [items, setItems] = useState<PostSummary[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [needLogin, setNeedLogin] = useState(false);
  const { reload: reloadBlocked } = blocked;

  const load = useCallback(() => {
    getCommunityApi()
      .feed(null)
      .then((page) => {
        setItems(page.items);
        setCursor(page.nextCursor);
        setError(null);
      })
      .catch((e) => setError(e?.message ?? String(e)));
  }, []);

  // 글을 쓰거나 차단하고 돌아오면 반영돼 있어야 한다
  useFocusEffect(
    useCallback(() => {
      load();
      reloadBlocked();
    }, [load, reloadBlocked]),
  );

  const more = () => {
    if (!cursor) return;
    getCommunityApi()
      .feed(cursor)
      .then((page) => {
        setItems((prev) => [...(prev ?? []), ...page.items]);
        setCursor(page.nextCursor);
      })
      .catch(() => {});
  };

  const guard = (go: () => void) => {
    if (me) go();
    else setNeedLogin(true);
  };

  const onTab = (next: Tab) => {
    if (next === 'mine') guard(() => me && router.push(`/community/user/${me.id}`));
  };

  const visible = (items ?? []).filter((p) => !blocked.ids.has(p.author.id));

  return (
    <Screen>
      <Title sub="꿈을 나누고 해몽을 듣는 곳">둘러보기</Title>
      <Segmented options={TABS} value="feed" onChange={onTab} />

      {needLogin && (
        <Card>
          <AppText size="label" weight="semibold">
            로그인하면 글을 쓰고 반응할 수 있습니다
          </AppText>
          <AppText size="caption" color={c.fgFaint}>
            읽기는 로그인 없이 됩니다. 로그인은 마이 탭에서 합니다.
          </AppText>
          <Button label="마이 탭으로" size="sm" variant="secondary" onPress={() => router.push('/my')} />
        </Card>
      )}

      {!!error && (
        <Card>
          <AppText size="caption" color={c.danger}>
            {error}
          </AppText>
        </Card>
      )}

      <FlatList
        data={visible}
        keyExtractor={(p) => p.id}
        renderItem={({ item }) => <PostCard post={item} onPress={() => router.push(`/community/${item.id}`)} />}
        ItemSeparatorComponent={() => <View style={{ height: sp[3] }} />}
        // 떠 있는 작성 버튼에 마지막 글이 가리지 않게 아래를 비운다
        contentContainerStyle={{ paddingBottom: hit.base + sp[10] }}
        showsVerticalScrollIndicator={false}
        onEndReached={more}
        onEndReachedThreshold={0.4}
        ListEmptyComponent={
          items === null ? null : (
            <Card>
              <AppText size="body" color={c.fgMuted}>
                아직 올라온 꿈이 없습니다.
              </AppText>
              <AppText size="caption" color={c.fgFaint}>
                아래 버튼으로 첫 해몽 요청을 올려 보세요.
              </AppText>
            </Card>
          )
        }
      />

      {/* 탭바 위에 뜬다(계획서 003 COM-1). 기호는 글자가 아니라 아이콘으로 그린다 */}
      <Pressable
        onPress={() => guard(() => router.push('/community/new'))}
        accessibilityRole="button"
        accessibilityLabel="글쓰기"
        style={({ pressed }) => [s.fab, pressed && { opacity: press }]}>
        <Plus size={24} strokeWidth={2} color={c.actionFg} />
      </Pressable>
    </Screen>
  );
}

const s = StyleSheet.create({
  fab: {
    position: 'absolute',
    right: sp[5],
    bottom: sp[5],
    width: hit.base,
    height: hit.base,
    borderRadius: r.chip,
    backgroundColor: c.action,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
