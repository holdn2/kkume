import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';

import { Avatar, Button, Card, Row, Screen, Stack } from '@components';
import { getCommunityApi, setBlocked, useBlocked, useMe } from '@features/community';
import { PostCard } from '@features/community/PostCard';
import type { PostSummary, Profile } from '@shared/api/community';
import { AppText } from '@shared/ui';
import { c, hit, sp } from '@theme/token';

/**
 * COM-4. 프로필 — **내 것 · 남의 것이 같은 화면**(계획서 003, 구현을 절반으로).
 * 커뮤니티의 "내 글" 탭이 곧 내 프로필이다. 남이면 [차단], 나면 [프로필 편집].
 *
 * 통계는 **글 수만** 둔다. 계획서 목업의 "기록 수 · 연속일"은 비공개인 꿈 기록에서 나오는 값이라
 * 남에게 보여도 되는지 서버에 물어 둔 상태다(문서 049 03장 3번).
 * 프로필 편집(닉네임 변경)은 서버에 API가 없어 아직 막아 둔다(같은 문서 4번).
 */
export default function ProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const me = useMe();
  const blocked = useBlocked();
  const [profile, setProfile] = useState<Profile | null | undefined>(undefined);
  const [posts, setPosts] = useState<PostSummary[]>([]);
  const { reload: reloadBlocked } = blocked;

  useFocusEffect(
    useCallback(() => {
      const api = getCommunityApi();
      api.profile(id).then(setProfile).catch(() => setProfile(null));
      api
        .userPosts(id, 'latest')
        .then((p) => setPosts(p.items))
        .catch(() => setPosts([]));
      reloadBlocked();
    }, [id, reloadBlocked]),
  );

  const mine = me?.id === id;
  const isBlocked = blocked.ids.has(id);

  const toggleBlock = () => {
    if (!profile) return;
    void setBlocked({ id: profile.id, nickname: profile.nickname }, !isBlocked).then(reloadBlocked);
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
          {mine ? (
            <Button label="프로필 편집 — 준비 중" size="sm" variant="secondary" disabled onPress={() => {}} />
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

  // 차단한 사람의 프로필에는 글을 보이지 않는다 — 피드에서 숨긴 것이 여기서 새지 않게
  const shown = isBlocked ? [] : posts;

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
                {isBlocked ? '차단한 사람의 글은 보이지 않습니다.' : '아직 올린 글이 없습니다.'}
              </AppText>
            </Card>
          ) : null
        }
      />
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
