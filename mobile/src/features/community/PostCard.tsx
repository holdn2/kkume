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
 * 읽는 순서대로 쌓는다 — 누가 · 언제 → 꿈 제목 → **꿈 내용** 두 줄 → 공감 · 댓글(문서 055).
 * 한마디는 선택이라 비어 있을 수 있고, 나누는 것의 중심이 꿈이라 목록은 꿈 내용을 보여 준다 — 한마디는 상세에서.
 * 반응 숫자는 아이콘과 붙여 한 덩어리로 둔다. 공감은 여기서 누르지 않는다 — 목록에서 누르게 하면
 * 스크롤하다 잘못 눌린다.
 */
export function PostCard({ post, onPress }: { post: PostSummary; onPress: () => void }) {
  return (
    <Card onPress={onPress}>
      <Stack gap={sp[2]}>
        <Row gap={sp[2]}>
          <AppText size="caption" color={c.fgMuted} style={{ flex: 1 }} numberOfLines={1}>
            {post.author.nickname} · {ago(post.createdAt)}
          </AppText>
          {/* 신고가 쌓여 가려진 내 글 — 나에게만 이 표시와 함께 보인다(056 04장 2) */}
          {post.hidden && <Badge label="다른 사람에게 안 보임" tone="warning" />}
          {post.hasComic && <Badge label="만화" tone="neutral" />}
        </Row>
        <AppText size="label" weight="semibold" numberOfLines={1}>
          {headline(post)}
        </AppText>
        <AppText size="body" color={c.fgMuted} numberOfLines={2}>
          {post.excerpt}
        </AppText>
        <Row gap={sp[4]}>
          <View style={s.meta} accessible accessibilityLabel={`공감 ${post.likeCount}`}>
            <Heart size={14} strokeWidth={1.75} color={c.fgFaint} fill={post.likedByMe ? c.fgFaint : 'none'} />
            <AppText size="caption" color={c.fgFaint}>
              {post.likeCount}
            </AppText>
          </View>
          <View style={s.meta} accessible accessibilityLabel={`댓글 ${post.commentCount}`}>
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

/** 꿈 제목 → 꿈 내용 첫 줄 순으로 물러선다 */
export function headline(p: Pick<PostSummary, 'title' | 'excerpt'>) {
  if (p.title?.trim()) return p.title.trim();
  return p.excerpt.split('\n')[0] || '제목 없는 꿈';
}

const s = StyleSheet.create({
  meta: { flexDirection: 'row', alignItems: 'center', gap: sp[1] },
});
