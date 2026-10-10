import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator } from 'react-native';

import { Button, Card, Header, Input, Radio, Row, Screen, Sheet, showToast, Stack, Switch } from '@components';
import { COMIC_ENABLED, useComicsForDream } from '@features/comic';
import { getCommunityApi, shareDream, useInvalidateCommunity, useMe } from '@features/community';
import { useDreamPages } from '@features/log/useDreamPages';
import { isApiError } from '@shared/api/client';
import { MAX_POST_BODY, MAX_POST_DREAM_TEXT } from '@shared/api/community';
import { MAX_TITLE_LENGTH } from '@shared/api/sync';
import { getDreamRepo, type Dream } from '@shared/db';
import { syncIfSignedIn } from '@shared/sync';
import { AppText } from '@shared/ui';
import { c, sp } from '@theme/token';

/**
 * COM-3. 꿈 공유하기.
 *
 * **2026-09-29 사용자 결정(문서 055)** — 해몽 요청 글쓰기에서 꿈 나눔으로 바뀌었다.
 * 꿈 고르기 → **제목 · 꿈 내용을 고친다**(고른 꿈으로 채워진 채 열린다) → 한마디(선택) → (만화 첨부) →
 * **게시 직전 닉네임 확인** → 공유하기.
 *
 * - **올리기 전에 고칠 수 있다.** 실명이나 사적인 부분을 빼고 올리려는 것이다. 원래 꿈 기록은 그대로다
 * - **올리는 순간 복사한다**(2026-09-24). 이후 꿈 기록을 고치거나 지워도 올린 글은 그대로이고, **녹음은 올리지 않는다**
 * - **같은 꿈은 한 번만 공유한다.** 이미 공유한 꿈을 고르면 「공유한 글 보기」로 안내한다
 *
 * 닉네임을 게시 바로 앞에 보이는 이유는 실명 노출 사고 방지다(계획서 003).
 *
 * 꿈 상세(LOG-2)에서 들어오면 `?dreamId=`로 그 꿈이 골라져 있다. 피드에서 들어오면 **꿈을 먼저 고른다.**
 */
export default function NewPostScreen() {
  const { dreamId, comicId } = useLocalSearchParams<{ dreamId?: string; comicId?: string }>();
  const router = useRouter();
  const me = useMe();
  const invalidate = useInvalidateCommunity();
  // 고른 꿈의 다 만든 만화. 만화 뷰어에서 들어왔으면(`?comicId=`) 그것, 아니면 그 꿈의 가장 최근 것(이슈 #92)
  const [withComic, setWithComic] = useState(true);

  /** 지운 것을 뺀 꿈 개수. 0이면 "아직 남긴 꿈이 없습니다" */
  const [total, setTotal] = useState<number | null>(null);
  /** 꿈 고르기 시트 — 30건씩 이어 읽고 제목 · 내용으로 찾는다(`useDreamPages`). 전에는 30건만 보였다 */
  const [pickQuery, setPickQuery] = useState('');
  const pages = useDreamPages(pickQuery);
  const [picked, setPicked] = useState<Dream | null>(null);
  const [choosing, setChoosing] = useState(false);
  const [title, setTitle] = useState('');
  const [dreamText, setDreamText] = useState('');
  /** 고른 꿈의 본문 길이. 이보다 긴 본문은 상한을 그만큼 올린다 — 넘친 채 열면 Fabric 이 지우기까지 막는다(문서 040) */
  const [openedTextLength, setOpenedTextLength] = useState(0);
  const [body, setBody] = useState('');
  /** 고른 꿈을 이미 공유했으면 그 글 id. 모르면 undefined */
  const [sharedPostId, setSharedPostId] = useState<string | null | undefined>(undefined);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** 꿈을 고르면 그 꿈으로 편집칸을 채우고, 이미 공유했는지 서버에 묻는다 */
  const pick = useCallback((d: Dream) => {
    setPicked(d);
    setTitle(d.title ?? '');
    setDreamText(d.text ?? '');
    setOpenedTextLength((d.text ?? '').length);
    setSharedPostId(undefined);
    setError(null);
    getCommunityApi()
      .postForDream(d.id)
      .then(setSharedPostId)
      .catch(() => setSharedPostId(null));
  }, []);

  useEffect(() => {
    let alive = true;
    // 꿈 상세에서 들어왔으면 그 꿈을 직접 읽는다 — 목록 앞쪽에 있는지와 상관없이
    getDreamRepo()
      .then(async (repo) => {
        const [n, from] = await Promise.all([repo.counts(), dreamId ? repo.get(dreamId) : Promise.resolve(null)]);
        if (!alive) return;
        setTotal(n.total);
        if (from && !from.deletedAt) pick(from);
      })
      .catch((e) => alive && setError(String(e)));
    return () => {
      alive = false;
    };
  }, [dreamId, pick]);

  // 꿈 내용은 한 글자 이상이어야 한다 — 목록이 꿈 내용을 보여 주고, 서버도 비면 400 dream_text_empty(계약 056).
  // 녹음만 남긴 꿈(글 없음)은 내용을 적어야 나눌 수 있다
  const comics = useComicsForDream(COMIC_ENABLED ? me?.id : null, picked?.id);
  const done = comics.data?.filter((x) => x.status === 'done') ?? [];
  const comic = done.find((x) => x.id === comicId) ?? done[0];
  const canPost = !!picked && sharedPostId === null && !!dreamText.trim() && !posting;

  const post = () => {
    if (!picked || !canPost) return;
    setPosting(true);
    // 동기화 뒤에 올린다 — 서버는 그 꿈이 내 것인지 확인해서, 방금 남긴 꿈은 아직 서버에 없을 수 있다(056)
    shareDream(getCommunityApi(), syncIfSignedIn, {
      dreamId: picked.id,
      title: title.trim() || null,
      dreamText: dreamText.trim(),
      dreamRecordedAt: picked.recordedAt,
      body: body.trim(),
      ...(COMIC_ENABLED && withComic && comic ? { comicId: comic.id } : {}),
    })
      .then((p) => {
        // 피드 · 꿈 상세의 「공유한 글 보기」가 새 글을 보게 캐시를 무효로 한다.
        // 글 화면은 이 화면을 대신하고, 거기서 뒤로 가면 꿈 나눔 피드로 간다(`from=share`)
        void invalidate();
        router.replace(`/community/${p.id}?from=share`);
      })
      .catch((e) => {
        // 그 사이 다른 곳에서 공유했으면 그 글로 안내한다. 글 id 는 오류 본문에 덧붙어 온다(서버 계약 056)
        const postId = isApiError(e) && e.code === 'already_shared' ? e.data?.postId : undefined;
        if (typeof postId === 'string') {
          setSharedPostId(postId);
          return;
        }
        // 안내 글씨는 화면 아래쪽(고정 버튼 위)이라 긴 꿈을 고치던 중이면 안 보인다 — 토스트로도(2026-10-08)
        const m = e?.message ?? '올리지 못했습니다';
        setError(m);
        showToast(m);
      })
      .finally(() => setPosting(false));
  };

  // 위에 고정된다 — 긴 꿈 내용을 고치다가도 바로 나갈 수 있게(2026-10-03)
  const header = <Header title="꿈 공유하기" onBack={() => router.back()} />;

  if (me === null) {
    return (
      <Screen header={header}>
        <Card>
          <AppText size="label" weight="semibold">
            로그인하면 꿈을 나눌 수 있습니다
          </AppText>
          <Button label="마이 탭으로" size="sm" variant="secondary" onPress={() => router.replace('/my')} />
        </Card>
      </Screen>
    );
  }

  return (
    <Screen
      scroll
      header={header}
      // 「공유하기」와 "○○(으)로 올라갑니다"는 아래에 고정한다(2026-10-05 사용자 요청) — 긴 꿈 내용을 고친 뒤
      // 끝까지 내려가지 않아도 누구 이름으로 올라가는지 보고 바로 올린다
      footer={
        picked && sharedPostId === null ? (
          <Stack gap={sp[2]}>
            {/* 게시 바로 앞에서 누구 이름으로 올라가는지 보인다(계획서 003 — 실명 노출 방지) */}
            <Row>
              <AppText size="caption" color={c.fgMuted} style={{ flex: 1 }}>
                <AppText size="caption" weight="semibold">
                  {me?.nickname ?? '…'}
                </AppText>
                (으)로 올라갑니다
              </AppText>
            </Row>
            <Button label={posting ? '올리는 중' : '공유하기'} disabled={!canPost} onPress={post} />
          </Stack>
        ) : undefined
      }>
      <Stack gap={sp[5]}>

        <Stack gap={sp[2]}>
          <AppText size="label" weight="semibold">
            어떤 꿈을 나눌까요?
          </AppText>
          {total === 0 ? (
            <Card>
              <AppText size="body" color={c.fgMuted}>
                아직 남긴 꿈이 없습니다. 꿈을 먼저 기록한 뒤 나눌 수 있습니다.
              </AppText>
            </Card>
          ) : picked ? (
            <Card>
              <Stack gap={sp[1]}>
                <AppText size="label" weight="semibold" numberOfLines={1}>
                  {dreamTitle(picked)}
                </AppText>
                <AppText size="caption" color={c.fgFaint}>
                  {picked.recordedAt.slice(0, 10)}에 꾼 꿈
                </AppText>
              </Stack>
            </Card>
          ) : null}
          {(total ?? 0) > 0 && (
            <Button
              label={picked ? '다른 꿈 고르기' : '꿈 고르기'}
              size="sm"
              variant={picked ? 'ghost' : 'secondary'}
              onPress={() => setChoosing(true)}
            />
          )}
        </Stack>

        {picked && sharedPostId && (
          <Card>
            <AppText size="label" weight="semibold">
              이미 나눈 꿈입니다
            </AppText>
            <AppText size="caption" color={c.fgFaint}>
              같은 꿈은 한 번만 나눌 수 있습니다. 올린 글을 지우면 다시 나눌 수 있습니다.
            </AppText>
            <Button
              label="공유한 글 보기"
              size="sm"
              variant="secondary"
              onPress={() => router.replace(`/community/${sharedPostId}`)}
            />
          </Card>
        )}

        {picked && sharedPostId === null && (
          <>
            <Stack gap={sp[3]}>
              <Input
                label="제목"
                value={title}
                onChangeText={setTitle}
                placeholder="제목 없이도 나눌 수 있습니다"
                maxLength={MAX_TITLE_LENGTH}
              />
              <Input
                label="꿈 내용"
                multiline
                value={dreamText}
                onChangeText={setDreamText}
                placeholder="나누고 싶은 꿈 내용을 적어 주세요 (필수)"
                maxLength={Math.max(MAX_POST_DREAM_TEXT, openedTextLength)}
              />
              <AppText size="caption" color={c.fgFaint}>
                올리기 전에 실명이나 사적인 부분은 빼도 됩니다. 원래 꿈 기록은 바뀌지 않고, 녹음은 올라가지 않습니다.
              </AppText>
            </Stack>

            <Input
              label="한마디 (선택)"
              multiline
              placeholder="하고 싶은 말이 있으면 적어 주세요"
              value={body}
              onChangeText={setBody}
              maxLength={MAX_POST_BODY}
              counter
            />

            {/* 이 꿈으로 다 만든 만화가 있을 때만 보인다. 전에는 꺼진 자리를 늘 보였는데,
                "기능이 생기면"이라는 빈자리는 미완성 기능으로 읽힌다(App Store 2.1, 문서 078) */}
            {COMIC_ENABLED && comic && (
              <Switch
                value={withComic}
                onChange={setWithComic}
                label="만화 함께 올리기"
                description="이 꿈으로 만든 네 컷 만화를 글에 붙여요"
              />
            )}
          </>
        )}

        {!!error && (
          <AppText size="caption" color={c.danger}>
            {error}
          </AppText>
        )}

      </Stack>

      <Sheet visible={choosing} onClose={() => setChoosing(false)} title="꿈 고르기" onEndReached={pages.more}>
        <Stack gap={sp[2]}>
          <Input
            value={pickQuery}
            onChangeText={setPickQuery}
            placeholder="꿈 검색 — 제목이나 내용으로"
            returnKeyType="search"
            accessibilityLabel="꿈 검색"
            clearable
            bordered
          />
          {pages.rows !== null && pages.rows.length === 0 && (
            <AppText size="caption" color={c.fgFaint}>
              {pickQuery.trim() ? `「${pickQuery.trim()}」이(가) 든 꿈이 없습니다.` : '아직 남긴 꿈이 없습니다.'}
            </AppText>
          )}
        </Stack>
        <Stack gap={sp[1]}>
          {(pages.rows ?? []).map((d) => (
            <Radio
              key={d.id}
              label={dreamTitle(d)}
              description={d.recordedAt.slice(0, 10)}
              selected={picked?.id === d.id}
              onSelect={() => {
                pick(d);
                setChoosing(false);
              }}
            />
          ))}
          {pages.hasMore && <ActivityIndicator color={c.fgMuted} style={{ padding: sp[3] }} />}
        </Stack>
      </Sheet>
    </Screen>
  );
}

function dreamTitle(d: Dream) {
  if (d.title?.trim()) return d.title.trim();
  const first = d.text?.trim().split('\n')[0];
  if (first) return first;
  return d.audioPath ? '음성으로 남긴 꿈' : '내용 없는 꿈';
}
