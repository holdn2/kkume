import { useLocalSearchParams, useRouter } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet } from 'react-native';

import { Button, Card, Input, Radio, Row, Screen, Sheet, Stack, Switch, Title } from '@components';
import { getCommunityApi, useMe } from '@features/community';
import { isApiError } from '@shared/api/client';
import { MAX_POST_BODY, MAX_POST_DREAM_TEXT } from '@shared/api/community';
import { MAX_TITLE_LENGTH } from '@shared/api/sync';
import { getDreamRepo, type Dream } from '@shared/db';
import { AppText } from '@shared/ui';
import { c, hit, sp } from '@theme/token';

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
  const { dreamId } = useLocalSearchParams<{ dreamId?: string }>();
  const router = useRouter();
  const me = useMe();

  const [dreams, setDreams] = useState<Dream[] | null>(null);
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
    getDreamRepo()
      .then((repo) => repo.list({ limit: 100 }))
      .then((list) => {
        if (!alive) return;
        setDreams(list);
        const from = dreamId ? list.find((d) => d.id === dreamId) : undefined;
        if (from) pick(from);
      })
      .catch((e) => alive && setError(String(e)));
    return () => {
      alive = false;
    };
  }, [dreamId, pick]);

  // 꿈 내용은 한 글자 이상이어야 한다 — 목록이 꿈 내용을 보여 주고, 서버도 비면 400 dream_text_empty(계약 056).
  // 녹음만 남긴 꿈(글 없음)은 내용을 적어야 나눌 수 있다
  const canPost = !!picked && sharedPostId === null && !!dreamText.trim() && !posting;

  const post = () => {
    if (!picked || !canPost) return;
    setPosting(true);
    getCommunityApi()
      .createPost({
        dreamId: picked.id,
        title: title.trim() || null,
        dreamText: dreamText.trim(),
        dreamRecordedAt: picked.recordedAt,
        body: body.trim(),
      })
      .then((p) => router.replace(`/community/${p.id}`))
      .catch((e) => {
        // 그 사이 다른 곳에서 공유했으면 그 글로 안내한다. 글 id 는 오류 본문에 덧붙어 온다(서버 계약 056)
        const postId = isApiError(e) && e.code === 'already_shared' ? e.data?.postId : undefined;
        if (typeof postId === 'string') {
          setSharedPostId(postId);
          return;
        }
        setError(e?.message ?? '올리지 못했습니다');
      })
      .finally(() => setPosting(false));
  };

  const back = (
    <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button" accessibilityLabel="뒤로" style={s.back}>
      <ChevronLeft size={24} strokeWidth={1.75} color={c.fg} />
    </Pressable>
  );

  if (me === null) {
    return (
      <Screen>
        {back}
        <Title>꿈 공유하기</Title>
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
    <Screen scroll>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Stack gap={sp[5]}>
          {back}
          <Title>꿈 공유하기</Title>

          <Stack gap={sp[2]}>
            <AppText size="label" weight="semibold">
              어떤 꿈을 나눌까요?
            </AppText>
            {dreams !== null && dreams.length === 0 ? (
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
            {(dreams?.length ?? 0) > 0 && (
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

              {/* 만화는 9~10주차에 붙는다. 자리를 보여 두되 꺼 둔다 */}
              <Switch value={false} onChange={() => {}} disabled label="만화 함께 올리기" description="만화 기능이 생기면 붙일 수 있습니다" />
            </>
          )}

          {!!error && (
            <AppText size="caption" color={c.danger}>
              {error}
            </AppText>
          )}

          {picked && sharedPostId === null && (
            <Stack gap={sp[2]}>
              {/* 게시 바로 앞에서 누구 이름으로 올라가는지 보인다(계획서 003 — 실명 노출 방지).
                  닉네임 변경은 서버에 아직 없어 [변경]을 두지 않는다(문서 049 03장 4번) */}
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
          )}
        </Stack>
      </KeyboardAvoidingView>

      <Sheet visible={choosing} onClose={() => setChoosing(false)} title="꿈 고르기">
        <Stack gap={sp[1]}>
          {(dreams ?? []).slice(0, 30).map((d) => (
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

const s = StyleSheet.create({
  back: { height: hit.min, justifyContent: 'center', alignSelf: 'flex-start' },
});
