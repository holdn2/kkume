import { useRouter } from 'expo-router';
import { ChevronDown, Plus } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';

import {
  Button,
  Card,
  EmptyCard,
  ErrorCard,
  Fab,
  FAB_ROOM,
  Input,
  ListSkeleton,
  MoreLoading,
  Radio,
  Row,
  Screen,
  SCROLL_TAIL,
  Segmented,
  Sheet,
  Stack,
  Title,
  useBleedBottom,
} from '@components';
import { useFeed, useMe, usePullRefresh, useRefetchOnFocus, useUserPosts } from '@features/community';
import { PostCard } from '@features/community/PostCard';
import { SEARCH_MAX, type FeedSort } from '@shared/api/community';
import { AppText } from '@shared/ui';
import { c, hit, press, sp } from '@theme/token';

type Scope = 'all' | 'mine';
const SCOPES = [
  { value: 'all', label: '전체' },
  { value: 'mine', label: '내 글' },
] as const;

const SORT_LABEL: Record<FeedSort, string> = { latest: '최신순', empathy: '공감순' };
const SORTS: FeedSort[] = ['latest', 'empathy'];
/** 글자마다 서버에 묻지 않게, 입력이 이만큼 멈춘 뒤 찾는다 */
const SEARCH_WAIT_MS = 350;

/**
 * COM-1. 꿈 나눔 피드.
 *
 * **2026-09-29 사용자 결정(문서 055)으로 "해몽 요청 피드"에서 "꿈 나눔"으로 바뀌었다.** 글은 꿈을 나누는 것이고
 * 해몽은 댓글에서 자유롭게 오간다. 위쪽 한 줄 — 왼쪽 「전체 / 내 글」, 오른쪽 정렬(「최신순 ▾」).
 * 「내 글」은 예전처럼 프로필로 보내지 않고 **이 피드 안에서 걸러 본다** — 같은 정렬로 보려는 것이다.
 *
 * 검색(COM-5, 이슈 #159)은 「전체」에서만 — 서버의 검색어 `q` 는 피드에만 있다(서버 #155 · PR #156, 문서 102).
 * 꿈 로그 검색창과 같은 모양이고, 서버가 50자를 넘으면 거절하므로 입력을 50자에서 막는다.
 *
 * **차단한 사람의 글은 서버가 거른다**(서버 계약 056 04장 1) — 앱에서 거르면 쪽이 비어 온다.
 * 2026-09-30부터 진짜 서버가 답한다(`@shared/api/communityHttp`).
 */
export default function CommunityScreen() {
  const router = useRouter();
  // 목록이 탭바 뒤까지 내려간다(`bleedBottom`) — 끝 여백에 그 높이를 더해 마지막 카드가 탭바 위로 올라오게(이슈 #153)
  const under = useBleedBottom();
  const me = useMe();
  const meId = me === undefined ? undefined : (me?.id ?? null);
  const [scope, setScope] = useState<Scope>('all');
  const [sort, setSort] = useState<FeedSort>('latest');
  const [sorting, setSorting] = useState(false);
  const [query, setQuery] = useState('');
  const [waited, setWaited] = useState('');
  useEffect(() => {
    const next = query.trim();
    if (!next) return;
    const t = setTimeout(() => setWaited(next), SEARCH_WAIT_MS);
    return () => clearTimeout(t);
  }, [query]);
  // 지울 때는 기다리지 않는다 — 비우면 곧바로 피드로 돌아가고, 다음 검색이 지난 결과로 시작하지 않게 비운다
  const onQuery = (v: string) => {
    setQuery(v);
    if (!v.trim()) setWaited('');
  };
  const term = query.trim() ? waited : '';

  // 쪽은 TanStack Query 가 들고 있다 — 탭을 오가도 다시 받지 않고, 끝에 닿으면 다음 쪽을 잇는다.
  // 「내 글」은 로그인했을 때만 켠다. 로그아웃하면 전체로 돌아간다
  const mine = scope === 'mine' && !!me;
  const searching = !mine && term.length > 0;
  const all = useFeed(meId, sort, mine ? '' : term);
  const minePages = useUserPosts(meId, mine ? meId : null, sort);
  const list = mine ? minePages : all;
  useRefetchOnFocus(list.refetch, list.isStale);
  const pull = usePullRefresh(list.refetch);

  // 로그인 전이면 위쪽 안내 카드가 이미 떠 있다. 로그인 여부를 읽는 중(undefined)의 탭은 무시한다
  const guard = (go: () => void) => {
    if (me) go();
  };

  const onScope = (next: Scope) => {
    if (next === 'mine' && !me) return;
    setScope(next);
  };

  // 로그인 여부를 읽는 동안(쿼리가 아직 꺼져 있음)도 불러오는 중이다 — 빈 목록 문구가 깜빡이지 않게
  const loading = list.isPending;
  const error = list.error ? ((list.error as { message?: string }).message ?? String(list.error)) : null;

  return (
    <Screen bleedBottom>
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

      {/* 꿈 나눔 검색 — 제목 · 꿈 내용 · 한마디에 든 말로 찾는다. 닉네임은 찾지 않는다(익명성) */}
      {!mine && (
        <Input
          value={query}
          onChangeText={onQuery}
          placeholder="꿈 나눔 검색 — 제목이나 내용으로"
          returnKeyType="search"
          accessibilityLabel="꿈 나눔 검색"
          maxLength={SEARCH_MAX}
          clearable
          bordered
        />
      )}

      {/* 로그인 전인 것과 로그인했는데 글이 없는 것을 가른다 — 로그인 전이면 늘 이 카드가 보인다 */}
      {me === null && (
        <Card>
          <AppText size="label" weight="semibold">
            로그인이 필요해요
          </AppText>
          <AppText size="caption" color={c.fgFaint}>
            꿈을 나누고 공감하려면 마이 탭에서 로그인해 주세요. 올라온 글은 로그인 없이도 볼 수 있어요.
          </AppText>
          <Button label="마이 탭으로" size="sm" variant="secondary" onPress={() => router.push('/my')} />
        </Card>
      )}

      {!!error && <ErrorCard message={error} onRetry={() => void list.refetch()} />}

      <FlatList
        data={list.items}
        keyExtractor={(p) => p.id}
        renderItem={({ item }) => <PostCard post={item} onPress={() => router.push(`/community/${item.id}`)} />}
        ItemSeparatorComponent={() => <View style={{ height: sp[3] }} />}
        // 떠 있는 공유 버튼에 마지막 글이 가리지 않게 아래를 비운다 — 버튼 높이 · 버튼 아래 띄움 · 여유
        contentContainerStyle={{ paddingBottom: FAB_ROOM + SCROLL_TAIL + under }}
        showsVerticalScrollIndicator={false}
        onEndReached={list.more}
        onEndReachedThreshold={0.4}
        refreshControl={
          <RefreshControl refreshing={pull.refreshing} onRefresh={pull.onRefresh} tintColor={c.fgMuted} />
        }
        ListFooterComponent={list.isFetchingNextPage ? <MoreLoading /> : null}
        ListEmptyComponent={
          loading ? (
            <ListSkeleton />
          ) : error ? null : searching ? (
            <EmptyCard title={`「${term}」이(가) 든 꿈이 없어요.`} hint="다른 말로 찾아보세요." />
          ) : (
            <EmptyCard
              title={mine ? '아직 나눈 꿈이 없어요.' : '아직 올라온 꿈이 없어요.'}
              hint="아래 버튼이나 꿈 상세의 「꿈 공유하기」로 나눠 보세요."
            />
          )
        }
      />

      {/* 탭바 위에 뜬다(계획서 003 COM-1). 여기서 시작하면 꿈을 먼저 고른다(문서 055) */}
      <Fab icon={Plus} label="꿈 공유하기" onPress={() => guard(() => router.push('/community/new'))} />

      <Sheet visible={sorting} onClose={() => setSorting(false)} title="정렬">
        <Stack gap={sp[1]}>
          {SORTS.map((v) => (
            <Radio
              key={v}
              label={SORT_LABEL[v]}
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
});
