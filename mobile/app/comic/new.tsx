import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';

import { Button, Header, Radio, Screen, Stack } from '@components';
import { explainCreateError, useComicActions } from '@features/comic';
import { useMe } from '@features/community';
import type { ComicStyle } from '@shared/api/comic';
import { getDreamRepo, type Dream } from '@shared/db';
import { AppText } from '@shared/ui';
import { c, sp } from '@theme/token';

/** 그림체 두 가지(계획서 001 축소안 — 4종 → 2종). 이름은 중립적으로, 작가 · 작품을 떠올리게 하지 않는다 */
const STYLES: { value: ComicStyle; label: string; description: string }[] = [
  { value: 'soft', label: '포근한 수채', description: '번지는 색으로 꿈의 흐릿한 느낌을 살려요' },
  { value: 'ink', label: '흑백 펜', description: '선과 명암만으로 또렷하게 그려요' },
];

/**
 * CM-1 만화 만들기(계획서 003 — "컷 수 → 그림체 → 만들기, 단일 흐름").
 *
 * 컷 수는 네 컷 하나라 고르게 하지 않는다. 8 · 16컷 잠금 표시는 넣지 않는다 — 결제가 없는데 잠긴 칸을
 * 보여 주면 미완성 기능으로 읽힌다(App Store 2.1, 문서 078).
 * 꿈 상세에서만 들어온다(`?dreamId=`). 꿈 내용은 지금 폰에 있는 것을 복사해 보낸다(문서 081 원칙 4).
 */
export default function ComicNew() {
  const { dreamId } = useLocalSearchParams<{ dreamId?: string }>();
  const router = useRouter();
  const me = useMe();
  const { create } = useComicActions();

  const [dream, setDream] = useState<Dream | null | undefined>(undefined);
  const [style, setStyle] = useState<ComicStyle>('soft');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    getDreamRepo()
      .then((repo) => (dreamId ? repo.get(dreamId) : null))
      .then((d) => alive && setDream(d))
      .catch(() => alive && setDream(null));
    return () => {
      alive = false;
    };
  }, [dreamId]);

  const back = () => (router.canGoBack() ? router.back() : router.replace('/log'));
  const empty = !!dream && !(dream.text ?? '').trim();

  const submit = () => {
    if (!dream || busy) return;
    setBusy(true);
    setError(null);
    create({ dreamId: dream.id, title: dream.title, dreamText: dream.text ?? '', style })
      .then((comic) => router.replace(`/comic/${comic.id}`))
      .catch((e) => {
        const f = explainCreateError(e);
        // 이미 만드는 중이면 그 만화로 보낸다 — 동시에 하나만 만든다(081 01장)
        if (f.kind === 'inProgress') router.replace(`/comic/${f.comicId}`);
        else setError(f.message);
      })
      .finally(() => setBusy(false));
  };

  return (
    <Screen
      scroll
      header={<Header title="만화로 만들기" onBack={back} />}
      footer={
        me ? (
          <Button label="만들기" onPress={submit} loading={busy} disabled={!dream || empty || busy} />
        ) : (
          <Button label="마이 탭에서 로그인하기" variant="secondary" onPress={() => router.push('/my')} />
        )
      }>
      <Stack gap={sp[6]}>
        <Stack gap={sp[2]}>
          <AppText size="heading" weight="bold" numberOfLines={2}>
            {dream === undefined ? '불러오는 중입니다' : (dream?.title ?? '제목 없는 꿈')}
          </AppText>
          <AppText size="caption" color={c.fgMuted}>
            {dream === null
              ? '꿈을 찾을 수 없습니다. 기록 목록에서 다시 골라 주세요.'
              : empty
                ? '꿈 내용이 비어 있어요. 내용을 적은 뒤 만들 수 있어요.'
                : '이 꿈을 네 컷 만화로 그려요. 1분쯤 걸리고, 화면을 나가도 계속 만들어요.'}
          </AppText>
        </Stack>

        <Stack gap={sp[1]}>
          <AppText size="label" weight="semibold">
            그림체
          </AppText>
          {STYLES.map((o) => (
            <Radio
              key={o.value}
              selected={style === o.value}
              onSelect={() => setStyle(o.value)}
              label={o.label}
              description={o.description}
            />
          ))}
        </Stack>

        <AppText size="caption" color={error ? c.danger : c.fgFaint}>
          {error ??
            (me === null
              ? '만화는 로그인한 뒤 만들 수 있어요. 하루에 만들 수 있는 수가 정해져 있어요.'
              : '하루에 만들 수 있는 수가 정해져 있어요. 꿈의 제목과 내용이 그림을 그리는 서비스로 전달돼요.')}
        </AppText>
      </Stack>
    </Screen>
  );
}
