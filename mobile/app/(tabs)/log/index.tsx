import { useFocusEffect, useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { Mic } from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, AppState, FlatList, View } from 'react-native';

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
  Row,
  Screen,
  SCROLL_TAIL,
  Sheet,
  showToast,
  Stack,
  Title,
  useBleedBottom,
} from '@components';
import { DictationPrompt } from '@features/log/DictationPrompt';
import { DreamCard } from '@features/log/DreamCard';
import { useDreamPages } from '@features/log/useDreamPages';
import { StorageWarning } from '@features/record/StorageWarning';
import { repairRecordingPaths } from '@shared/audio/paths';
import { useAuth } from '@shared/auth';
import { getDreamRepo, syncStateOf } from '@shared/db';
import { syncIfSignedIn } from '@shared/sync';
import { afterForeground } from '@shared/sync/foreground';
import { AppText } from '@shared/ui';
import { sp } from '@theme/token';

/** 여러 개를 지운 뒤 「되돌리기」 줄이 떠 있는 시간. 읽고 누를 만큼 — 토스트(2.5초)보다 길게 */
const UNDO_MS = 8000;

/**
 * LOG-1. 앱의 홈이다.
 *
 * **기록 버튼은 오른쪽 아래에 떠 있다**(이슈 #139, 098 D4 사용자 결정). 앱을 여는 이유가 "읽기"보다 "남기기"인 날이 많고
 * 잠금화면 위젯을 아직 안 깐 사용자에게는 여기가 진입점이라, 목록 맨 위 버튼이었다가 엄지가 닿는 자리로 내렸다.
 *
 * **여러 개 지우기**(이슈 #185): 카드를 길게 누르면 선택 모드다. 위에 「n개 선택 · 모두 선택 · 지우기 · 취소」, 누르면 고르고
 * 풀고, 기록 버튼은 숨긴다. 확인을 한 번 받고 지운 뒤 「되돌리기」 줄을 잠깐 띄운다 — 기록 유실이 이 앱에서 유일하게
 * 용납되지 않는 실패라, 한 번에 여러 개를 지우는 길에는 되돌릴 길을 같이 둔다. 지우기는 한 건과 같은 soft delete 라
 * 본문 · 녹음은 폰에 남고, 되돌리기는 지운 표시만 뗀다(`restore` — 그 사이 서버에 「지움」이 갔어도 다음 동기화에 살아난다).
 *
 * `FlatList`를 쓴다. 계획서 기술 스택에 `@shopify/flash-list`가 있지만
 * **그건 네이티브라 빌드를 한 번 먹는다.** 목록이 실제로 느려지는 것을 본 뒤에 바꾼다.
 */
export default function LogScreen() {
  const router = useRouter();
  const signedIn = !!useAuth().session;
  // 목록이 탭바 뒤까지 내려간다(`bleedBottom`) — 끝 여백에 그 높이를 더해 마지막 카드가 탭바 위로 올라오게(이슈 #153)
  const under = useBleedBottom();
  // 새벽 녹음을 마치고 떨어진 것이면 권한 카드를 띄우지 않는다(record.tsx의 leave)
  const { from } = useLocalSearchParams<{ from?: string }>();
  // 파라미터는 **이 화면의** navigation으로 지운다. 전역 router.setParams는 그 순간 포커스된 화면에
  // 붙는데, blur는 다음 화면으로 넘어간 뒤에 와서 엉뚱한 화면의 파라미터를 지웠다(검증 레인 C 3차 1)
  const navigation = useNavigation<{ setParams: (p: { from?: string }) => void }>();
  const [query, setQuery] = useState('');
  const searching = query.trim().length > 0;
  // 30건씩 읽고 끝에 닿으면 잇는다. 검색은 폰의 SQLite 에서 — 서버를 거치지 않는다(`useDreamPages`)
  const { rows, hasMore, counts, error, reload, more } = useDreamPages(query);

  // 선택 모드. null 이면 선택 중이 아니다 — 빈 Set 은 「선택 모드인데 아직 고른 것이 없다」
  const [picked, setPicked] = useState<Set<string> | null>(null);
  const choosing = picked !== null;
  const [askDelete, setAskDelete] = useState(false);
  // 확인 시트에 적을 수. 지운 뒤 닫히는 동안 「0개」로 바뀌어 보이지 않게, 열 때 정해 둔다
  const [askCount, setAskCount] = useState(0);
  const [deleting, setDeleting] = useState(false);
  // 방금 지운 것들. 이 줄이 떠 있는 동안 되돌릴 수 있다
  const [undo, setUndo] = useState<string[] | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (undoTimer.current) clearTimeout(undoTimer.current);
    },
    [],
  );

  // 지우는 중에는 고르기 · 시트를 바꾸지 않는다 — 끝날 때 선택을 비우므로 그 사이 고른 것이 사라진다(PR #186 리뷰)
  const toggle = (id: string) =>
    !deleting &&
    setPicked((cur) => {
      const next = new Set(cur ?? []);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const loaded = rows ?? [];
  const allPicked = !!picked && loaded.length > 0 && loaded.every((d) => picked.has(d.id));

  const offerUndo = (ids: string[]) => {
    if (undoTimer.current) clearTimeout(undoTimer.current);
    setUndo(ids);
    undoTimer.current = setTimeout(() => setUndo(null), UNDO_MS);
    // 8초 안에 눌러야 하는 줄이라 화면 읽기에도 알린다(토스트와 같게, PR #186 리뷰)
    AccessibilityInfo.announceForAccessibility(`꿈 ${ids.length}개를 지웠어요. 되돌리기를 누르면 되돌려요.`);
  };

  const removePicked = () => {
    if (!picked || picked.size === 0 || deleting) return;
    const ids = [...picked];
    setDeleting(true);
    void (async () => {
      // 하나씩 지운다. 중간에 실패해도 이미 지운 것은 되돌릴 수 있게 남긴다
      const done: string[] = [];
      try {
        const repo = await getDreamRepo();
        for (const id of ids) {
          // 그 사이 다른 기기에서 지워져 동기화로 내려온 기록은 건너뛴다 — 되돌리기 목록에 넣으면 남이 지운 기록을
          // 되살려 서버에 다시 올린다(PR #186 리뷰)
          const current = await repo.get(id);
          if (!current || current.deletedAt) continue;
          await repo.softDelete(id);
          done.push(id);
        }
      } catch {
        showToast(
          done.length > 0 ? `${done.length}개만 지웠어요. 나머지는 다시 시도해 주세요.` : '지우지 못했어요. 다시 시도해 주세요.',
        );
      } finally {
        setDeleting(false);
        setAskDelete(false);
        setPicked(null);
        reload();
        if (done.length > 0) offerUndo(done);
      }
    })();
  };

  const restoreRemoved = () => {
    const ids = undo;
    if (!ids) return;
    if (undoTimer.current) clearTimeout(undoTimer.current);
    setUndo(null);
    void (async () => {
      const done: string[] = [];
      try {
        const repo = await getDreamRepo();
        for (const id of ids) {
          await repo.restore(id);
          done.push(id);
        }
        showToast(`꿈 ${ids.length}개를 되돌렸어요.`, 'neutral');
      } catch {
        // 못 되돌린 것은 줄로 다시 띄워 한 번 더 누를 수 있게 한다. 그 사이 새로 지운 것이 줄에 있으면 그것을 덮지 않는다
        const left = ids.filter((id) => !done.includes(id));
        showToast('일부를 되돌리지 못했어요. 「되돌리기」를 한 번 더 눌러 주세요.');
        if (left.length > 0) {
          setUndo((cur) => {
            if (cur) return cur;
            if (undoTimer.current) clearTimeout(undoTimer.current);
            undoTimer.current = setTimeout(() => setUndo(null), UNDO_MS);
            return left;
          });
        }
      } finally {
        reload();
      }
    })();
  };

  // 기록하고 돌아오면 목록에 있어야 한다. 화면에 들어올 때마다 다시 읽는다 —
  // 기록 화면은 저장하고 router.replace로 이 화면에 떨어뜨리므로 마운트가 새로 일어나지 않는다
  //
  // **동기화도 여기서 부른다.** 앱 시작에 걸지 않은 이유가 있다 —
  // 새벽에 위젯으로 들어온 흐름에 끼어들 수 있고, 그건 절대 규칙 1(로컬에 먼저)이
  // 막으려는 자리다. 목록은 낮에 보는 화면이라 안전하다.
  // 복귀는 **이 화면이 보이는 동안만** 잠깐 기다렸다가 다시 부른다(`afterForeground`, 이슈 #187) —
  // 이 화면을 띄운 채 앱을 내렸다 열면 포커스가 다시 오지 않아 동기화가 멈춰 있었다. 위젯으로 들어오면
  // 그 사이 녹음 화면이 위로 열려 이 화면이 포커스를 잃으므로 기다림이 끊긴다
  // **로컬을 먼저 그리고 동기화는 뒤에 돈다.** 서버를 기다리면 목록이 늦게 뜬다
  useFocusEffect(
    useCallback(() => {
      reload();
      // 녹음 경로 정리가 먼저다 — 캐시 폴더의 녹음을 옮긴 뒤라야 업로드가 옮긴 경로로 올린다.
      // 로그인과 상관없이 돈다. 원본을 지키는 일이라 동기화보다 앞선다(절대 규칙 2)
      const sync = () =>
        void repairRecordingPaths()
          .then(() => syncIfSignedIn())
          .then((r) => {
            // 뭔가 바뀌었을 때만 다시 읽는다. 매번 읽으면 목록이 한 번 깜빡인다
            if (r && (r.pulled > 0 || r.pushed > 0)) reload();
          })
          .catch(() => {});
      sync();
      const stopForeground = afterForeground(AppState, sync);
      // 화면을 떠나면 `from=record`를 지운다. 탭은 파라미터를 들고 있어서, 안 지우면 앱을 다시 켤 때까지
      // 카드가 안 뜨고 — 이미 온보딩을 지난 폰은 받아쓰기 권한을 물을 곳이 없어진다(검증 레인 C 2차 B-2)
      return () => {
        stopForeground();
        if (from) navigation.setParams({ from: undefined });
        // 다른 탭에 갔다 오면 선택 모드는 끝나 있다 — 돌아와서 고른 줄 모르고 지우지 않게
        setPicked(null);
        setAskDelete(false);
      };
    }, [reload, from, navigation]),
  );

  return (
    <Screen bleedBottom>
      <Title sub={sub(counts, searching)}>꿈 로그</Title>

      {/* 선택 모드의 머리 줄 — 고른 수 · 모두 선택 · 지우기 · 취소(이슈 #185) */}
      {/* 글과 버튼을 두 줄로 — 한 줄이면 큰 글씨에서 「취소」가 화면 밖으로 밀렸다(PR #186 리뷰) */}
      {choosing && (
        <Stack gap={sp[2]}>
          <AppText size="label" weight="semibold">
            {picked.size > 0 ? `${picked.size}개 선택` : '지울 꿈을 골라 주세요'}
          </AppText>
          <Row gap={sp[2]} style={{ flexWrap: 'wrap' }}>
          <Button
            label={allPicked ? '선택 풀기' : '모두 선택'}
            size="sm"
            variant="ghost"
            disabled={deleting}
            onPress={() => setPicked(allPicked ? new Set() : new Set(loaded.map((d) => d.id)))}
          />
          <Button label="지우기" size="sm" variant="danger" disabled={picked.size === 0 || deleting}
            onPress={() => {
              setAskCount(picked.size);
              setAskDelete(true);
            }}
          />
          <Button label="취소" size="sm" variant="ghost" disabled={deleting} onPress={() => setPicked(null)} />
          </Row>
        </Stack>
      )}

      {/* 방금 여러 개를 지웠다 — 잠깐 되돌릴 수 있다 */}
      {!!undo && !choosing && (
        <Card>
          <Row gap={sp[2]}>
            <AppText size="caption" style={{ flex: 1 }}>
              꿈 {undo.length}개를 지웠어요.
            </AppText>
            <Button label="되돌리기" size="sm" variant="secondary" onPress={restoreRemoved} />
          </Row>
        </Card>
      )}

      {/* 기기 저장소를 못 열어 메모리에 저장 중일 때만 뜬다 — 빈 목록을 보고 다 날아간 줄 알지 않게(문서 104 S1) */}
      <StorageWarning />

      {/* 받아쓰기 권한을 낮에 한 번 묻는다. 새벽 녹음 화면은 권한을 조회만 한다(절대 규칙 7) */}
      {from !== 'record' && <DictationPrompt />}

      {/* 꿈 로그 검색 — 제목 · 본문에 든 말로 찾는다. 기록이 하나도 없으면 찾을 것이 없어 숨긴다 */}
      {(searching || (counts?.total ?? 0) > 0) && (
        <Input
          value={query}
          onChangeText={setQuery}
          placeholder="꿈 검색 — 제목이나 내용으로"
          returnKeyType="search"
          accessibilityLabel="꿈 검색"
          clearable
          bordered
        />
      )}

      {!!error && <ErrorCard message={`기록을 읽지 못했어요. ${error}`} onRetry={() => reload()} />}

      <FlatList
        data={rows ?? []}
        keyExtractor={(d) => d.id}
        renderItem={({ item }) => (
          <DreamCard
            dream={item}
            // 로그인했을 때만 — 로그인 안 했으면 모든 카드가 대기라 표시가 소음이 된다(문서 104 C6)
            pending={signedIn && syncStateOf(item) === 'pending'}
            // 선택 모드에서는 누르면 고르고 풀고, 아니면 길게 눌러 선택 모드로 들어간다
            selected={choosing ? picked.has(item.id) : undefined}
            onPress={() => (choosing ? toggle(item.id) : router.push(`/dream/${item.id}`))}
            // 선택 중에도 비워 두지 않는다 — 비우면 길게 누른 손을 뗄 때 onPress 가 돌아 방금 고른 카드가 풀린다(PR #186 리뷰)
            onLongPress={() => {
              if (!choosing) setPicked(new Set([item.id]));
            }}
          />
        )}
        // 행 사이 간격이 곧 경계다. 구분선을 긋지 않는 것은 ListRow와 같은 이유다
        ItemSeparatorComponent={() => <View style={{ height: sp[3] }} />}
        contentContainerStyle={{ paddingBottom: FAB_ROOM + SCROLL_TAIL + under }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        onEndReached={more}
        onEndReachedThreshold={0.5}
        ListFooterComponent={hasMore ? <MoreLoading /> : null}
        ListEmptyComponent={
          rows === null ? (
            error ? null : <ListSkeleton />
          ) : searching ? (
            <EmptyCard title={`「${query.trim()}」이(가) 든 꿈이 없어요.`} hint="다른 말로 찾아보세요." />
          ) : (
            <EmptyCard
              title="아직 남긴 꿈이 없어요."
              hint="아래 마이크 버튼으로 지금 남겨 보세요. 잠금화면 위젯을 올려 두면 새벽에 폰을 집자마자 바로 돼요."
              // 처음 쓰는 사람이 가장 오래 머무는 화면이라 위젯 설치를 한 번 더 권한다(계획서 003 LOG-1 빈 상태, 문서 104)
              action={{ label: '잠금화면 위젯 올리는 법', onPress: () => router.push('/onboarding?step=widget') }}
            />
          )
        }
      />

      {/* 고르는 중에는 기록 버튼을 숨긴다 — 지우려고 고르다가 엄지가 닿는 자리다 */}
      {!choosing && <Fab icon={Mic} label="지금 기록하기" onPress={() => router.push('/record')} />}

      {/* 한 건 지우기(꿈 상세)와 같은 모양의 확인. 여러 개라 되돌릴 길을 함께 말한다 */}
      <Sheet
        visible={askDelete}
        onClose={() => !deleting && setAskDelete(false)}
        title={`꿈 ${askCount}개를 지울까요`}
        description="지운 직후 잠깐은 「되돌리기」로 되돌릴 수 있어요. 그 뒤로는 되돌릴 수 없어요.">
        <Stack gap={sp[2]} style={{ paddingTop: sp[4] }}>
          <Button label="지우기" variant="danger" loading={deleting} onPress={removePicked} />
          <Button label="취소" variant="ghost" disabled={deleting} onPress={() => setAskDelete(false)} />
        </Stack>
      </Sheet>
    </Screen>
  );
}

function sub(counts: { total: number; unread: number } | null, searching: boolean) {
  if (counts === null) return undefined;
  if (searching) return `검색 결과 ${counts.total}건`;
  if (counts.total === 0) return '아직 비어 있어요';
  return counts.unread > 0 ? `${counts.total}건 · 미확인 ${counts.unread}건` : `${counts.total}건`;
}
