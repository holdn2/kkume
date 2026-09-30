import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';

import { Avatar, Button, Card, Input, Row, Screen, Sheet, Stack } from '@components';
import { getCommunityApi, setBlocked, useBlocked, useMe } from '@features/community';
import { PostCard } from '@features/community/PostCard';
import { NICKNAME_MAX, NICKNAME_MIN, type PostSummary, type Profile } from '@shared/api/community';
import { loadSession, saveSession } from '@shared/auth/session';
import { AppText } from '@shared/ui';
import { c, hit, sp } from '@theme/token';

/**
 * COM-4. 프로필 — **내 것 · 남의 것이 같은 화면**(계획서 003, 구현을 절반으로).
 * 남이면 [차단], 나면 [닉네임 바꾸기].
 *
 * 통계는 **글 수만** 둔다(서버 계약 056 04장 3) — 기록 수 · 연속일은 비공개인 꿈 기록에서 나오는 값이다.
 * 닉네임은 2~16자(056 04장 4). 글에 복사하지 않아 바꾸면 지난 글의 이름도 바뀐다.
 * **차단한 사람의 프로필도 글을 보여 준다** — 서버가 거르지 않는 곳(일부러 찾아 들어온 경우)이라
 * 맨 위에 "차단한 사용자입니다"만 둔다(056 04장 1 · 057 04장).
 */
export default function ProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const me = useMe();
  const blocked = useBlocked();
  const [profile, setProfile] = useState<Profile | null | undefined>(undefined);
  const [posts, setPosts] = useState<PostSummary[]>([]);
  const [renaming, setRenaming] = useState(false);
  const [nickname, setNickname] = useState('');
  const [renameError, setRenameError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const { reload: reloadBlocked } = blocked;

  const loadProfile = useCallback(() => {
    getCommunityApi()
      .profile(id)
      .then(setProfile)
      .catch(() => setProfile(null));
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      const api = getCommunityApi();
      loadProfile();
      api
        .userPosts(id, 'latest')
        .then((p) => setPosts(p.items))
        .catch(() => setPosts([]));
      reloadBlocked();
    }, [id, loadProfile, reloadBlocked]),
  );

  const trimmed = nickname.trim();
  const nicknameOk = trimmed.length >= NICKNAME_MIN && trimmed.length <= NICKNAME_MAX && !nickname.includes('\n');

  const saveNickname = () => {
    if (!nicknameOk || saving) return;
    setSaving(true);
    getCommunityApi()
      .setNickname(trimmed)
      .then(async (a) => {
        // 폰의 세션에 든 닉네임도 바꾼다 — "○○(으)로 올라갑니다"가 옛 이름을 보이지 않게
        const s = await loadSession();
        if (s) await saveSession({ ...s, user: { ...s.user, nickname: a.nickname } });
        setRenaming(false);
        loadProfile();
      })
      .catch((e) => setRenameError(e?.message ?? '바꾸지 못했습니다'))
      .finally(() => setSaving(false));
  };

  const mine = me?.id === id;
  const isBlocked = blocked.ids.has(id);

  const toggleBlock = () => {
    if (!profile) return;
    setBlocked({ id: profile.id, nickname: profile.nickname }, !isBlocked)
      .then(reloadBlocked)
      .catch(() => {});
  };

  const header = (
    <Stack gap={sp[4]}>
      <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button" accessibilityLabel="뒤로" style={s.back}>
        <ChevronLeft size={24} strokeWidth={1.75} color={c.fg} />
      </Pressable>
      {profile === undefined ? (
        <AppText color={c.fgMuted}>불러오는 중입니다</AppText>
      ) : profile === null ? (
        <AppText color={c.fgMuted}>찾을 수 없는 사람입니다.</AppText>
      ) : (
        <Stack gap={sp[4]}>
          <Row gap={sp[3]}>
            <Avatar name={profile.nickname} size="lg" />
            <Stack gap={sp[1]} style={{ flex: 1 }}>
              <AppText size="heading" weight="bold" numberOfLines={1}>
                {profile.nickname}
              </AppText>
              <AppText size="caption" color={c.fgFaint}>
                {joined(profile.joinedAt)} 가입 · 글 {profile.postCount}
              </AppText>
            </Stack>
          </Row>
          {isBlocked && (
            <Card>
              <AppText size="caption" color={c.fgMuted}>
                차단한 사용자입니다. 피드와 댓글에서는 이 사람의 글이 보이지 않습니다.
              </AppText>
            </Card>
          )}
          {mine ? (
            <Button
              label="닉네임 바꾸기"
              size="sm"
              variant="secondary"
              onPress={() => {
                setNickname(profile.nickname);
                setRenameError(null);
                setRenaming(true);
              }}
            />
          ) : (
            <Button
              label={isBlocked ? '차단 풀기' : '차단하기'}
              size="sm"
              variant={isBlocked ? 'secondary' : 'danger'}
              onPress={toggleBlock}
            />
          )}
          <AppText size="label" weight="semibold">
            {mine ? '내가 쓴 글' : '작성한 글'}
          </AppText>
        </Stack>
      )}
    </Stack>
  );

  const shown = posts;

  return (
    <Screen>
      <FlatList
        data={profile ? shown : []}
        keyExtractor={(p) => p.id}
        ListHeaderComponent={header}
        ListHeaderComponentStyle={{ marginBottom: sp[4] }}
        renderItem={({ item }) => <PostCard post={item} onPress={() => router.push(`/community/${item.id}`)} />}
        ItemSeparatorComponent={() => <View style={{ height: sp[3] }} />}
        contentContainerStyle={{ paddingBottom: sp[8] }}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          profile ? (
            <Card>
              <AppText size="caption" color={c.fgFaint}>
                아직 올린 글이 없습니다.
              </AppText>
            </Card>
          ) : null
        }
      />

      <Sheet visible={renaming} onClose={() => setRenaming(false)} title="닉네임 바꾸기">
        <Stack gap={sp[3]}>
          <Input
            value={nickname}
            onChangeText={(v) => {
              setNickname(v);
              setRenameError(null);
            }}
            maxLength={NICKNAME_MAX}
            counter
            autoFocus
            error={renameError ?? undefined}
          />
          <AppText size="caption" color={c.fgFaint}>
            {NICKNAME_MIN}~{NICKNAME_MAX}자. 바꾸면 지난 글과 댓글의 이름도 새 이름으로 보입니다.
          </AppText>
          <Button label={saving ? '바꾸는 중' : '바꾸기'} disabled={!nicknameOk || saving} onPress={saveNickname} />
        </Stack>
      </Sheet>
    </Screen>
  );
}

function joined(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월`;
}

const s = StyleSheet.create({
  back: { height: hit.min, justifyContent: 'center', alignSelf: 'flex-start' },
});
