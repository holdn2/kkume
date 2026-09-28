import { useLocalSearchParams, useRouter } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet } from 'react-native';

import { Button, Card, Input, Radio, Row, Screen, Sheet, Stack, Switch, Title } from '@components';
import { getCommunityApi, useMe } from '@features/community';
import { MAX_POST_BODY } from '@shared/api/community';
import { getDreamRepo, type Dream } from '@shared/db';
import { AppText } from '@shared/ui';
import { c, hit, sp } from '@theme/token';

/**
 * COM-3. 해몽 요청 글쓰기.
 *
 * 순서는 계획서 003 그대로 — 꿈 고르기 → (만화 첨부) → 해몽 요청 글 → **게시 직전 닉네임 확인** → 게시.
 * 닉네임을 게시 바로 앞에 보이는 이유는 실명 노출 사고 방지다. 서버가 붙이는 닉네임은 실명이 아니지만,
 * 사용자가 "누구 이름으로 올라가는지"를 게시 전에 한 번은 봐야 한다.
 *
 * **게시할 때 꿈 내용을 복사한다**(2026-09-24 사용자 결정). 이후 꿈 기록을 고치거나 지워도 올린 글은
 * 그대로이고, 꿈 기록은 비공개로 남는다. **녹음은 올리지 않는다.**
 *
 * 꿈 상세(LOG-2)에서 들어오면 `?dreamId=`로 그 꿈이 미리 골라져 있다.
 */
export default function NewPostScreen() {
  const { dreamId } = useLocalSearchParams<{ dreamId?: string }>();
  const router = useRouter();
  const me = useMe();

  const [dreams, setDreams] = useState<Dream[] | null>(null);
  const [picked, setPicked] = useState<Dream | null>(null);
  const [choosing, setChoosing] = useState(false);
  const [body, setBody] = useState('');
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    getDreamRepo()
      .then((repo) => repo.list({ limit: 100 }))
      .then((list) => {
        if (!alive) return;
        setDreams(list);
        setPicked(list.find((d) => d.id === dreamId) ?? list[0] ?? null);
      })
      .catch((e) => alive && setError(String(e)));
    return () => {
      alive = false;
    };
  }, [dreamId]);

  const post = () => {
    if (!picked || !body.trim() || posting) return;
    setPosting(true);
    getCommunityApi()
      .createPost({
        dreamId: picked.id,
        title: picked.title,
        // 녹음만 남긴 꿈이면 본문이 비어 있다. 녹음은 올리지 않으니 빈 채로 간다
        dreamText: picked.text ?? '',
        dreamRecordedAt: picked.recordedAt,
        body: body.trim(),
      })
      .then((p) => router.replace(`/community/${p.id}`))
      .catch((e) => setError(e?.message ?? '올리지 못했습니다'))
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
        <Title>글쓰기</Title>
        <Card>
          <AppText size="label" weight="semibold">
            로그인하면 글을 올릴 수 있습니다
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
          <Title>글쓰기</Title>

          <Stack gap={sp[2]}>
            <AppText size="label" weight="semibold">
              어떤 꿈을 나눌까요?
            </AppText>
            {dreams !== null && dreams.length === 0 ? (
              <Card>
                <AppText size="body" color={c.fgMuted}>
                  아직 남긴 꿈이 없습니다. 꿈을 먼저 기록한 뒤 올릴 수 있습니다.
                </AppText>
              </Card>
            ) : picked ? (
              <Card>
                <Stack gap={sp[1]}>
                  <AppText size="label" weight="semibold" numberOfLines={1}>
                    {dreamTitle(picked)}
                  </AppText>
                  <AppText size="caption" color={c.fgFaint}>
                    {picked.recordedAt.slice(0, 10)}
                    {picked.text?.trim() ? '' : ' · 적은 내용이 없는 음성 기록'}
                  </AppText>
                </Stack>
              </Card>
            ) : null}
            {(dreams?.length ?? 0) > 1 && (
              <Button label="다른 꿈 고르기" size="sm" variant="ghost" onPress={() => setChoosing(true)} />
            )}
            <AppText size="caption" color={c.fgFaint}>
              올리는 순간의 내용이 복사됩니다. 나중에 꿈 기록을 고쳐도 올린 글은 바뀌지 않고, 녹음은 올라가지 않습니다.
            </AppText>
          </Stack>

          {/* 만화는 9~10주차에 붙는다. 자리를 보여 두되 꺼 둔다 */}
          <Switch value={false} onChange={() => {}} disabled label="만화 함께 올리기" description="만화 기능이 생기면 붙일 수 있습니다" />

          <Input
            multiline
            placeholder="해몽이 궁금해요…"
            value={body}
            onChangeText={setBody}
            maxLength={MAX_POST_BODY}
            counter
          />

          {!!error && (
            <AppText size="caption" color={c.danger}>
              {error}
            </AppText>
          )}

          <Stack gap={sp[2]}>
            {/* 게시 바로 앞에서 누구 이름으로 올라가는지 보인다(계획서 003 — 실명 노출 방지).
                닉네임 변경은 서버에 아직 없어 [변경]을 두지 않는다(문서 049 03장 4번) */}
            <Row>
              <AppText size="caption" color={c.fgMuted} style={{ flex: 1 }}>
                <AppText size="caption" weight="semibold">
                  {me?.nickname ?? '…'}
                </AppText>
                (으)로 게시됩니다
              </AppText>
            </Row>
            <Button label={posting ? '올리는 중' : '게시'} disabled={!picked || !body.trim() || posting} onPress={post} />
          </Stack>
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
                setPicked(d);
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
