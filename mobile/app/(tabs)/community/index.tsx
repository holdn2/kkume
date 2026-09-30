import { useFocusEffect, useRouter } from 'expo-router';
import { ChevronDown, Plus } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';

import { Button, Card, Radio, Row, Screen, Segmented, Sheet, Stack, Title } from '@components';
import { getCommunityApi, mergePage, useBlocked, useMe } from '@features/community';
import { PostCard } from '@features/community/PostCard';
import type { FeedSort, PostSummary } from '@shared/api/community';
import { AppText } from '@shared/ui';
import { c, hit, press, r, sp } from '@theme/token';

type Scope = 'all' | 'mine';
const SCOPES = [
  { value: 'all', label: '전체' },
  { value: 'mine', label: '내 글' },
] as const;

const SORT_LABEL: Record<FeedSort, string> = { latest: '최신순', empathy: '공감순' };
const SORTS: FeedSort[] = ['latest', 'empathy'];

/**
 * COM-1. 꿈 나눔 피드.
 *
 * **2026-09-29 사용자 결정(문서 055)으로 "해몽 요청 피드"에서 "꿈 나눔"으로 바뀌었다.** 글은 꿈을 나누는 것이고
 * 해몽은 댓글에서 자유롭게 오간다. 위쪽 한 줄 — 왼쪽 「전체 / 내 글」, 오른쪽 정렬(「최신순 ▾」).
 * 「내 글」은 예전처럼 프로필로 보내지 않고 **이 피드 안에서 걸러 본다** — 같은 정렬로 보려는 것이다.
 *
 * **차단한 사람의 글은 서버가 거른다**(서버 계약 056 04장 1) — 앱에서 거르면 쪽이 비어 온다.
 * 2026-09-30부터 진짜 서버가 답한다(`@shared/api/communityHttp`).
 */
export default function CommunityScreen() {
  const router = useRouter();
  const me = useMe();
  const [scope, setScope] = useState<Scope>('all');
  const [sort, setSort] = useState<FeedSort>('latest');
  const [sorting, setSorting] = useState(false);
  const [items, setItems] = useState<PostSummary[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [needLogin, setNeedLogin] = useState(false);
  // 차단 목록은 여기서 거르지 않는다(서버가 거름, 056). 읽기만 해서 폰에 남은 옛 차단을 서버로 옮긴다
  const { reload: reloadBlocked } = useBlocked();

  const fetchPage = useCallback(
    (from: string | null) => {
      const api = getCommunityApi();
      if (scope === 'mine') {
        // 로그인 전에는 내 글이 없다. 전환 자체를 막으므로 여기 오지 않지만, 오더라도 빈 목록이다
        if (!me) return Promise.resolve({ items: [], nextCursor: null });
        return api.userPosts(me.id, sort, from);
      }
      return api.feed(sort, from);
    },
    [scope, sort, me],
  );

  const load = useCallback(() => {
    fetchPage(null)
      .then((page) => {
        setItems(page.items);
        setCursor(page.nextCursor);
        setError(null);
      })
      .catch((e) => setError(e?.message ?? String(e)));
  }, [fetchPage]);

  // 글을 쓰거나 차단하고 돌아오면 반영돼 있어야 한다. 전환 · 정렬을 바꿔도 다시 읽는다(load 가 바뀐다)
  useFocusEffect(
    useCallback(() => {
      load();
      reloadBlocked();
    }, [load, reloadBlocked]),
  );

  const more = () => {
    if (!cursor) return;
    fetchPage(cursor)
      .then((page) => {
        // 공감순은 쪽 사이에 순서가 움직여 같은 글이 또 올 수 있다 — id 로 거른다(056)
        setItems((prev) => mergePage(prev ?? [], page.items));
        setCursor(page.nextCursor);
      })
      .catch(() => {});
  };

  const guard = (go: () => void) => {
    if (me) go();
    else setNeedLogin(true);
  };

  const onScope = (next: Scope) => {
    if (next === 'mine' && !me) {
      setNeedLogin(true);
      return;
    }
    setScope(next);
  };

  const visible = items ?? [];

  return (
    <Screen>
      <Title sub="간밤의 꿈을 나누는 곳">꿈 나눔</Title>

      <Row gap={sp[3]}>
        <View style={{ flex: 1 }}>
          <Segmented options={SCOPES} value={scope} onChange={onScope} />
        </View>
        {/* 정렬 드롭다운. ▾는 글자가 아니라 아이콘으로 그린다(규칙 11) */}
        <Pressable
          onPress={() => setSorting(true)}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={`정렬 · ${SORT_LABEL[sort]}`}
          style={({ pressed }) => [s.sort, pressed && { opacity: press }]}>
          <AppText size="caption" color={c.fgMuted}>
            {SORT_LABEL[sort]}
          </AppText>
          <ChevronDown size={16} strokeWidth={1.75} color={c.fgMuted} />
        </Pressable>
      </Row>

      {needLogin && (
        <Card>
          <AppText size="label" weight="semibold">
            로그인하면 꿈을 나누고 공감할 수 있습니다
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
        // 떠 있는 공유 버튼에 마지막 글이 가리지 않게 아래를 비운다
        contentContainerStyle={{ paddingBottom: hit.base + sp[10] }}
        showsVerticalScrollIndicator={false}
        onEndReached={more}
        onEndReachedThreshold={0.4}
        ListEmptyComponent={
          items === null ? null : (
            <Card>
              <AppText size="body" color={c.fgMuted}>
                {scope === 'mine' ? '아직 나눈 꿈이 없습니다.' : '아직 올라온 꿈이 없습니다.'}
              </AppText>
              <AppText size="caption" color={c.fgFaint}>
                아래 버튼이나 꿈 상세의 「꿈 공유하기」로 나눠 보세요.
              </AppText>
            </Card>
          )
        }
      />

      {/* 탭바 위에 뜬다(계획서 003 COM-1). 여기서 시작하면 꿈을 먼저 고른다(문서 055) */}
      <Pressable
        onPress={() => guard(() => router.push('/community/new'))}
        accessibilityRole="button"
        accessibilityLabel="꿈 공유하기"
        style={({ pressed }) => [s.fab, pressed && { opacity: press }]}>
        <Plus size={24} strokeWidth={2} color={c.actionFg} />
      </Pressable>

      <Sheet visible={sorting} onClose={() => setSorting(false)} title="정렬">
        <Stack gap={sp[1]}>
          {SORTS.map((v) => (
            <Radio
              key={v}
              label={v === 'latest' ? '최신순' : '공감 많은 순'}
              selected={sort === v}
              onSelect={() => {
                setSort(v);
                setSorting(false);
              }}
            />
          ))}
        </Stack>
      </Sheet>
    </Screen>
  );
}

const s = StyleSheet.create({
  sort: { flexDirection: 'row', alignItems: 'center', gap: sp[1], minHeight: hit.min, paddingHorizontal: sp[1] },
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
