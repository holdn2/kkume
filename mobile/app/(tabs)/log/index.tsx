import { useFocusEffect, useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { Mic } from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';

import { Card, Input, Screen, Title } from '@components';
import { DictationPrompt } from '@features/log/DictationPrompt';
import { DreamCard } from '@features/log/DreamCard';
import { repairRecordingPaths } from '@shared/audio/paths';
import { getDreamRepo, type Dream } from '@shared/db';
import { syncIfSignedIn } from '@shared/sync';
import { AppText } from '@shared/ui';
import { c, hit, press, r, sp } from '@theme/token';

/**
 * LOG-1. 앱의 홈이다.
 *
 * **목록보다 기록 버튼이 위에 있다.** 앱을 여는 이유가 "읽기"보다 "남기기"인 날이 많고,
 * 잠금화면 위젯을 아직 안 깐 사용자에게는 여기가 유일한 진입점이다.
 *
 * `FlatList`를 쓴다. 계획서 기술 스택에 `@shopify/flash-list`가 있지만
 * **그건 네이티브라 빌드를 한 번 먹는다.** 목록이 실제로 느려지는 것을 본 뒤에 바꾼다.
 */
export default function LogScreen() {
  const router = useRouter();
  // 새벽 녹음을 마치고 떨어진 것이면 권한 카드를 띄우지 않는다(record.tsx의 leave)
  const { from } = useLocalSearchParams<{ from?: string }>();
  // 파라미터는 **이 화면의** navigation으로 지운다. 전역 router.setParams는 그 순간 포커스된 화면에
  // 붙는데, blur는 다음 화면으로 넘어간 뒤에 와서 엉뚱한 화면의 파라미터를 지웠다(검증 레인 C 3차 1)
  const navigation = useNavigation<{ setParams: (p: { from?: string }) => void }>();
  const [rows, setRows] = useState<Dream[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  /** 목록을 읽을 때 쓰는 검색어. 입력이 멈춘 뒤의 값이다 — 렌더가 아니라 읽기에서만 쓰므로 ref */
  const applied = useRef('');
  const searching = query.trim().length > 0;

  const load = useCallback(() => {
    getDreamRepo()
      .then((repo) => repo.list({ limit: 100, query: applied.current }))
      .then((list) => {
        setRows(list);
        setError(null);
      })
      .catch((e) => setError(String(e)));
  }, []);

  // 검색어는 입력이 멈추면 적용한다. 목록은 폰의 SQLite 에서 찾는다 — 서버를 거치지 않는다
  useEffect(() => {
    const t = setTimeout(() => {
      applied.current = query;
      load();
    }, 200);
    return () => clearTimeout(t);
  }, [query, load]);

  // 기록하고 돌아오면 목록에 있어야 한다. 화면에 들어올 때마다 다시 읽는다 —
  // 기록 화면은 저장하고 router.replace로 이 화면에 떨어뜨리므로 마운트가 새로 일어나지 않는다
  //
  // **동기화도 여기서 부른다.** 앱 시작이나 백그라운드 복귀에 걸지 않은 이유가 있다 —
  // 새벽에 위젯으로 들어온 흐름에 끼어들 수 있고, 그건 절대 규칙 1(로컬에 먼저)이
  // 막으려는 자리다. 목록은 낮에 보는 화면이라 안전하다.
  // **로컬을 먼저 그리고 동기화는 뒤에 돈다.** 서버를 기다리면 목록이 늦게 뜬다
  useFocusEffect(
    useCallback(() => {
      load();
      // 녹음 경로 정리가 먼저다 — 캐시 폴더의 녹음을 옮긴 뒤라야 업로드가 옮긴 경로로 올린다.
      // 로그인과 상관없이 돈다. 원본을 지키는 일이라 동기화보다 앞선다(절대 규칙 2)
      void repairRecordingPaths()
        .then(() => syncIfSignedIn())
        .then((r) => {
        // 뭔가 바뀌었을 때만 다시 읽는다. 매번 읽으면 목록이 한 번 깜빡인다
        if (r && (r.pulled > 0 || r.pushed > 0)) load();
      });
      // 화면을 떠나면 `from=record`를 지운다. 탭은 파라미터를 들고 있어서, 안 지우면 앱을 다시 켤 때까지
      // 카드가 안 뜨고 — 이미 온보딩을 지난 폰은 받아쓰기 권한을 물을 곳이 없어진다(검증 레인 C 2차 B-2)
      return () => {
        if (from) navigation.setParams({ from: undefined });
      };
    }, [load, from, navigation]),
  );

  return (
    <Screen>
      <Title sub={searching ? `검색 결과 ${rows?.length ?? 0}건` : sub(rows)}>꿈 로그</Title>

      <Pressable
        onPress={() => router.push('/record')}
        accessibilityRole="button"
        accessibilityLabel="지금 기록하기"
        style={({ pressed }) => [s.record, pressed && { opacity: press }]}>
        <Mic size={20} strokeWidth={1.75} color={c.actionFg} />
        <AppText size="label" weight="semibold" color={c.actionFg}>
          지금 기록하기
        </AppText>
      </Pressable>

      {/* 받아쓰기 권한을 낮에 한 번 묻는다. 새벽 녹음 화면은 권한을 조회만 한다(절대 규칙 7) */}
      {from !== 'record' && <DictationPrompt />}

      {/* 꿈 로그 검색 — 제목 · 본문에 든 말로 찾는다. 기록이 하나도 없으면 찾을 것이 없어 숨긴다 */}
      {(searching || (rows?.length ?? 0) > 0) && (
        <Input
          value={query}
          onChangeText={setQuery}
          placeholder="꿈 검색 — 제목이나 내용으로"
          returnKeyType="search"
          accessibilityLabel="꿈 검색"
        />
      )}

      {!!error && (
        <Card>
          <AppText size="caption" color={c.danger}>
            {error}
          </AppText>
        </Card>
      )}

      <FlatList
        data={rows ?? []}
        keyExtractor={(d) => d.id}
        renderItem={({ item }) => (
          <DreamCard dream={item} onPress={() => router.push(`/dream/${item.id}`)} />
        )}
        // 행 사이 간격이 곧 경계다. 구분선을 긋지 않는 것은 ListRow와 같은 이유다
        ItemSeparatorComponent={() => <View style={{ height: sp[3] }} />}
        contentContainerStyle={{ paddingBottom: sp[6] }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        ListEmptyComponent={
          rows === null ? null : searching ? (
            <Card>
              <AppText size="body" color={c.fgMuted}>
                「{query.trim()}」이(가) 든 꿈이 없습니다.
              </AppText>
            </Card>
          ) : (
            <Empty />
          )
        }
      />
    </Screen>
  );
}

function sub(rows: Dream[] | null) {
  if (rows === null) return undefined;
  if (rows.length === 0) return '아직 비어 있습니다';
  const unread = rows.filter((d) => d.reviewedAt == null).length;
  return unread > 0 ? `${rows.length}건 · 미확인 ${unread}건` : `${rows.length}건`;
}

/**
 * 빈 화면에서 할 일을 하나만 말한다.
 * 여기서 기능을 늘어놓으면 아직 한 번도 안 써 본 사람이 무엇부터 할지 고르게 된다.
 */
function Empty() {
  return (
    <Card>
      <AppText size="body" color={c.fgMuted}>
        아직 남긴 꿈이 없습니다.
      </AppText>
      <AppText size="caption" color={c.fgFaint}>
        위의 버튼으로 지금 남겨 보세요. 잠금화면 위젯을 올려 두면 새벽에 폰을 집자마자 바로 됩니다.
      </AppText>
    </Card>
  );
}

const s = StyleSheet.create({
  record: {
    height: hit.base,
    borderRadius: r.control,
    backgroundColor: c.action,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: sp[2],
  },
});
