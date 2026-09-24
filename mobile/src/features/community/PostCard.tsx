import { Heart, MessageCircle } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import { Badge, Card, Row, Stack } from '@components';
import type { PostSummary } from '@shared/api/community';
import { AppText } from '@shared/ui';
import { c, sp } from '@theme/token';

import { ago } from './format';

/**
 * 피드 · 프로필의 글 한 줄(COM-1 · COM-4).
 *
 * 읽는 순서대로 쌓는다 — 누가 · 언제 → 꿈 제목 → 해몽 요청 두 줄 → 반응.
 * 반응 숫자는 아이콘과 붙여 한 덩어리로 둔다. 좋아요는 여기서 누르지 않는다 —
 * 목록에서 누르게 하면 스크롤하다 잘못 눌리고, 상세에서 누르는 것이 이 피드의 성격(해몽)에 맞다.
 */
export function PostCard({ post, onPress }: { post: PostSummary; onPress: () => void }) {
  return (
    <Card onPress={onPress}>
      <Stack gap={sp[2]}>
        <Row gap={sp[2]}>
          <AppText size="caption" color={c.fgMuted} style={{ flex: 1 }} numberOfLines={1}>
            {post.author.nickname} · {ago(post.createdAt)}
          </AppText>
          {post.hasComic && <Badge label="만화" tone="neutral" />}
        </Row>
        <AppText size="label" weight="semibold" numberOfLines={1}>
          {headline(post)}
        </AppText>
        <AppText size="body" color={c.fgMuted} numberOfLines={2}>
          {post.excerpt}
        </AppText>
        <Row gap={sp[4]}>
          <View style={s.meta}>
            <Heart size={14} strokeWidth={1.75} color={c.fgFaint} fill={post.likedByMe ? c.fgFaint : 'none'} />
            <AppText size="caption" color={c.fgFaint}>
              {post.likeCount}
            </AppText>
          </View>
          <View style={s.meta}>
            <MessageCircle size={14} strokeWidth={1.75} color={c.fgFaint} />
            <AppText size="caption" color={c.fgFaint}>
              {post.commentCount}
            </AppText>
          </View>
        </Row>
      </Stack>
    </Card>
  );
}

/** 꿈 제목 → 해몽 요청 첫 줄 순으로 물러선다 */
export function headline(p: Pick<PostSummary, 'title' | 'excerpt'>) {
  if (p.title?.trim()) return p.title.trim();
  return p.excerpt.split('\n')[0] || '제목 없는 꿈';
}

const s = StyleSheet.create({
  meta: { flexDirection: 'row', alignItems: 'center', gap: sp[1] },
});
