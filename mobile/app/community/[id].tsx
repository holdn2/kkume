import { useLocalSearchParams, useRouter } from 'expo-router';
import { ChevronLeft, CornerDownRight, Flag, Heart, MoreHorizontal, X } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, View } from 'react-native';

import { Button, Card, Input, Radio, Row, Screen, Sheet, Stack, Switch } from '@components';
import { ago, getCommunityApi, REPORT_REASONS, setBlocked, useBlocked, useMe } from '@features/community';
import {
  MAX_COMMENT,
  type Author,
  type Comment,
  type PostDetail,
  type ReportReason,
  type ReportTarget,
} from '@shared/api/community';
import { AppText } from '@shared/ui';
import { c, hit, press, sp } from '@theme/token';

type Reporting = ReportTarget & { author: Author };

/**
 * COM-2. 글 상세.
 *
 * 순서는 계획서 003 그대로 — 꿈 → (한마디) → 만화 → 반응 → 댓글. 반응 이름은 「공감」(문서 055).
 * 한마디는 선택이라 없으면 그 자리를 비운다.
 * **신고는 반응 줄에 늘 보인다**(숨기지 않는다 — 계획서 001 "신고 버튼만 있고 처리 주체가 없으면
 * 없는 것보다 나쁘다"의 반대편: 처리 주체(자동 가림)가 있으니 버튼도 찾기 쉬워야 한다).
 * **차단은 우상단 ⋯ 안에** 둔다. 신고와 차단을 한 번에 하고 싶으면 신고 시트에서 함께 고른다(COM-6).
 *
 * 댓글은 **답글까지 한 단계**(2026-09-24 사용자 결정, 에브리타임 방식). 답글에는 [답글]이 없다.
 */
export default function PostScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const me = useMe();
  const blocked = useBlocked();

  const [post, setPost] = useState<PostDetail | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [draft, setDraft] = useState('');
  const [replyTo, setReplyTo] = useState<Comment | null>(null);
  const [sending, setSending] = useState(false);

  const [menuOpen, setMenuOpen] = useState(false);
  const [reporting, setReporting] = useState<Reporting | null>(null);
  const [reason, setReason] = useState<ReportReason>('sexual');
  const [alsoBlock, setAlsoBlock] = useState(false);

  const load = useCallback(() => {
    getCommunityApi()
      .post(id)
      .then((p) => {
        setPost(p);
        setError(null);
      })
      .catch((e) => setError(e?.message ?? String(e)));
  }, [id]);

  useEffect(load, [load]);

  /** 쓰기는 로그인해야 한다. 안 했으면 이유를 말하고 멈춘다 */
  const needMe = (): Author | null => {
    if (me) return me;
    setNotice('로그인하면 반응하고 댓글을 달 수 있습니다. 로그인은 마이 탭에서 합니다.');
    return null;
  };

  const toggleLike = () => {
    if (!post || !needMe()) return;
    const next = !post.likedByMe;
    // 먼저 그려 놓고 서버 값으로 맞춘다. 실패하면 되돌린다
    setPost({ ...post, likedByMe: next, likeCount: post.likeCount + (next ? 1 : -1) });
    getCommunityApi()
      .setLiked(post.id, next)
      .then((r) => setPost((p) => (p ? { ...p, ...r } : p)))
      .catch((e) => {
        setPost((p) => (p ? { ...p, likedByMe: !next, likeCount: p.likeCount + (next ? -1 : 1) } : p));
        setNotice(e?.message ?? '반영하지 못했습니다');
      });
  };

  const send = () => {
    const body = draft.trim();
    if (!post || !body || sending || !needMe()) return;
    setSending(true);
    getCommunityApi()
      .addComment(post.id, body, replyTo?.id ?? null)
      .then(() => {
        setDraft('');
        setReplyTo(null);
        load();
      })
      .catch((e) => setNotice(e?.message ?? '댓글을 달지 못했습니다'))
      .finally(() => setSending(false));
  };

  const removeComment = (cm: Comment) => {
    getCommunityApi()
      .deleteComment(cm.id)
      .then(load)
      .catch((e) => setNotice(e?.message ?? '지우지 못했습니다'));
  };

  const removePost = () => {
    if (!post) return;
    setMenuOpen(false);
    getCommunityApi()
      .deletePost(post.id)
      .then(() => router.back())
      .catch((e) => setNotice(e?.message ?? '지우지 못했습니다'));
  };

  const block = (user: Author) => {
    setMenuOpen(false);
    setBlocked(user, true)
      .then(() => {
        blocked.reload();
        // 글쓴이를 차단했으면 피드로 돌아간다 — 피드에서는 서버가 그 사람 글을 뺀다
        if (post && user.id === post.author.id) router.back();
        else {
          setNotice(`${user.nickname}님을 차단했습니다. 그 사람의 글과 댓글이 보이지 않습니다.`);
          load();
        }
      })
      .catch((e) => setNotice(e?.message ?? '차단하지 못했습니다'));
  };

  const unblockAuthor = () => {
    if (!post) return;
    setBlocked(post.author, false)
      .then(blocked.reload)
      .catch((e) => setNotice(e?.message ?? '차단을 풀지 못했습니다'));
  };

  const openReport = (target: Reporting) => {
    if (!needMe()) return;
    setReason('sexual');
    setAlsoBlock(false);
    setReporting(target);
  };

  const submitReport = () => {
    if (!reporting) return;
    const target = reporting;
    setReporting(null);
    getCommunityApi()
      .report({ type: target.type, id: target.id }, reason)
      .then(async () => {
        if (alsoBlock) {
          await setBlocked(target.author, true);
          blocked.reload();
          if (post && target.author.id === post.author.id) {
            router.back();
            return;
          }
        }
        setNotice('신고했습니다. 여러 사람이 신고하면 자동으로 가려집니다.');
        load();
      })
      .catch((e) => setNotice(e?.message ?? '신고하지 못했습니다'));
  };

  if (post === undefined) {
    return (
      <Screen>
        <Back onPress={() => router.back()} />
        <AppText color={c.fgMuted}>{error ?? '불러오는 중입니다'}</AppText>
      </Screen>
    );
  }

  if (post === null) {
    return (
      <Screen>
        <Back onPress={() => router.back()} />
        <AppText color={c.fgMuted}>지워졌거나 가려진 글입니다.</AppText>
      </Screen>
    );
  }

  const mine = me?.id === post.author.id;
  // 차단한 사람의 글이어도 링크로 들어왔으면 보여 준다 — 서버가 거르지 않는 자리다(056 04장 1)
  const authorBlocked = blocked.ids.has(post.author.id);
  // 가려진 내 글은 공감 · 댓글을 받지 않는다(서버가 404) — 버튼을 끈다(056 04장 2)
  const closed = post.hidden;
  const thread = visibleThread(post.comments);

  return (
    <Screen scroll>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Stack gap={sp[5]}>
          <Row>
            <Back onPress={() => router.back()} />
            <View style={{ flex: 1 }} />
            <Pressable
              onPress={() => setMenuOpen(true)}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="더 보기"
              style={({ pressed }) => pressed && { opacity: press }}>
              <MoreHorizontal size={22} strokeWidth={1.75} color={c.fgMuted} />
            </Pressable>
          </Row>

          {post.hidden && (
            <Card>
              <AppText size="label" weight="semibold">
                신고가 쌓여 다른 사람에게는 보이지 않습니다
              </AppText>
              <AppText size="caption" color={c.fgFaint}>
                공감과 댓글을 더 받지 않습니다. 오른쪽 위 메뉴에서 지울 수 있고, 지우면 같은 꿈을 다시 나눌 수 있습니다.
              </AppText>
            </Card>
          )}

          {authorBlocked && (
            <Card>
              <AppText size="label" weight="semibold">
                차단한 사용자의 글입니다
              </AppText>
              <Button label="차단 풀기" size="sm" variant="secondary" onPress={unblockAuthor} />
            </Card>
          )}

          <Pressable
            onPress={() => router.push(`/community/user/${post.author.id}`)}
            accessibilityRole="button"
            style={({ pressed }) => pressed && { opacity: press }}>
            <AppText size="caption" color={c.fgMuted}>
              {post.author.nickname} · {ago(post.createdAt)}
            </AppText>
          </Pressable>

          <Stack gap={sp[2]}>
            <AppText size="heading" weight="bold">
              {post.title?.trim() || '제목 없는 꿈'}
            </AppText>
            <AppText size="caption" color={c.fgFaint}>
              {post.dreamRecordedAt.slice(0, 10)}에 꾼 꿈
            </AppText>
          </Stack>

          {!!post.dreamText.trim() && (
            <Card>
              <AppText size="body">{post.dreamText}</AppText>
            </Card>
          )}

          {/* 올린 사람의 한마디. 선택이라 없으면 그리지 않는다(문서 055) */}
          {!!post.body.trim() && (
            <AppText size="body" color={c.fgMuted}>
              {post.body}
            </AppText>
          )}

          {/* 만화는 9~10주차에 붙는다. 자리만 두고 지금은 그리지 않는다(comicUrl이 늘 null) */}

          <Row gap={sp[5]}>
            <Pressable
              onPress={toggleLike}
              disabled={closed}
              accessibilityRole="button"
              accessibilityLabel={post.likedByMe ? `공감 취소 · ${post.likeCount}` : `공감 · ${post.likeCount}`}
              style={({ pressed }) => [s.action, pressed && { opacity: press }]}>
              <Heart size={18} strokeWidth={1.75} color={c.fg} fill={post.likedByMe ? c.fg : 'none'} />
              <AppText size="label">공감 {post.likeCount}</AppText>
            </Pressable>
            <View style={{ flex: 1 }} />
            {!mine && (
              <Pressable
                onPress={() => openReport({ type: 'post', id: post.id, author: post.author })}
                accessibilityRole="button"
                style={({ pressed }) => [s.action, pressed && { opacity: press }]}>
                <Flag size={16} strokeWidth={1.75} color={c.fgFaint} />
                <AppText size="caption" color={c.fgFaint}>
                  신고
                </AppText>
              </Pressable>
            )}
          </Row>

          {!!notice && (
            <Card>
              <AppText size="caption" color={c.fgMuted}>
                {notice}
              </AppText>
            </Card>
          )}

          <Stack gap={sp[4]}>
            <AppText size="label" weight="semibold">
              댓글 {thread.filter((x) => !x.comment.deleted).length}
            </AppText>
            {thread.map(({ comment, placeholder }) => (
              <CommentItem
                key={comment.id}
                comment={comment}
                placeholder={placeholder}
                mine={me?.id === comment.author.id}
                onReply={() => {
                  if (!needMe()) return;
                  setReplyTo(comment);
                }}
                onReport={() => openReport({ type: 'comment', id: comment.id, author: comment.author })}
                onDelete={() => removeComment(comment)}
              />
            ))}
          </Stack>

          {!closed && (
          <Stack gap={sp[2]}>
            {replyTo && (
              <Row gap={sp[2]}>
                <AppText size="caption" color={c.fgMuted} style={{ flex: 1 }}>
                  {replyTo.author.nickname}님에게 답글
                </AppText>
                <Pressable onPress={() => setReplyTo(null)} hitSlop={12} accessibilityRole="button" accessibilityLabel="답글 취소">
                  <X size={16} strokeWidth={1.75} color={c.fgFaint} />
                </Pressable>
              </Row>
            )}
            <Input
              placeholder={replyTo ? '답글을 적어 주세요' : '해몽이나 비슷한 경험을 나눠 주세요'}
              value={draft}
              onChangeText={setDraft}
              maxLength={MAX_COMMENT}
              multiline
            />
            <Button label={sending ? '올리는 중' : '댓글 달기'} size="sm" disabled={!draft.trim() || sending} onPress={send} />
          </Stack>
          )}
        </Stack>
      </KeyboardAvoidingView>

      <Sheet visible={menuOpen} onClose={() => setMenuOpen(false)}>
        <Stack gap={sp[2]}>
          {mine ? (
            <Button label="이 글 지우기" variant="danger" onPress={removePost} />
          ) : (
            <Button label={`${post.author.nickname}님 차단하기`} variant="danger" onPress={() => block(post.author)} />
          )}
          <Button label="닫기" variant="ghost" onPress={() => setMenuOpen(false)} />
        </Stack>
      </Sheet>

      {/* COM-6. 신고와 차단을 한 화면에서 함께 처리한다(계획서 003) */}
      <Sheet
        visible={reporting != null}
        onClose={() => setReporting(null)}
        title="신고하기"
        description="신고 사유를 선택해 주세요. 여러 사람이 신고하면 자동으로 가려집니다.">
        <Stack gap={sp[4]}>
          <Stack gap={sp[1]}>
            {REPORT_REASONS.map((r) => (
              <Radio key={r.value} label={r.label} selected={reason === r.value} onSelect={() => setReason(r.value)} />
            ))}
          </Stack>
          {reporting && (
            <Switch
              value={alsoBlock}
              onChange={setAlsoBlock}
              label={`${reporting.author.nickname}님도 차단하기`}
              description="차단하면 그 사람의 글과 댓글이 내 화면에서 사라집니다"
            />
          )}
          <Stack gap={sp[2]}>
            <Button label="신고하기" variant="danger" onPress={submitReport} />
            <Button label="그만두기" variant="ghost" onPress={() => setReporting(null)} />
          </Stack>
        </Stack>
      </Sheet>
    </Screen>
  );
}

function Back({ onPress }: { onPress: () => void }) {
  return (
    <Pressable onPress={onPress} hitSlop={12} accessibilityRole="button" accessibilityLabel="뒤로" style={s.back}>
      <ChevronLeft size={24} strokeWidth={1.75} color={c.fg} />
    </Pressable>
  );
}

/**
 * 댓글을 부모 · 답글 순으로 늘어놓는다. **차단한 사람의 댓글은 서버가 거른다**(056 04장 1) — 지운 댓글과
 * 같은 규칙이라 답글 달린 댓글은 `deleted` 자리로 오고, 아니면 아예 안 온다. 화면은 거르지 않는다
 */
function visibleThread(comments: Comment[]) {
  const out: { comment: Comment; placeholder: string | null }[] = [];
  const tops = comments.filter((x) => x.parentId == null);
  for (const t of tops) {
    const replies = comments.filter((x) => x.parentId === t.id);
    out.push({ comment: t, placeholder: t.deleted ? '삭제되었거나 볼 수 없는 댓글입니다' : null });
    for (const r of replies) out.push({ comment: r, placeholder: null });
  }
  return out;
}

function CommentItem(props: {
  comment: Comment;
  placeholder: string | null;
  mine: boolean;
  onReply: () => void;
  onReport: () => void;
  onDelete: () => void;
}) {
  const { comment, placeholder, mine } = props;
  const isReply = comment.parentId != null;
  return (
    <View style={[s.comment, isReply && s.reply]}>
      {isReply && <CornerDownRight size={14} strokeWidth={1.75} color={c.fgFaint} style={s.replyMark} />}
      <Stack gap={sp[1]} style={{ flex: 1 }}>
        {placeholder ? (
          <AppText size="caption" color={c.fgFaint}>
            {placeholder}
          </AppText>
        ) : (
          <>
            <AppText size="caption" color={c.fgMuted}>
              {comment.author.nickname} · {ago(comment.createdAt)}
            </AppText>
            <AppText size="body">{comment.body}</AppText>
            <Row gap={sp[4]}>
              {/* 답글에는 답글이 없다 — 한 단계까지(2026-09-24 사용자 결정) */}
              {!isReply && <TextAction label="답글" onPress={props.onReply} />}
              {mine ? <TextAction label="지우기" onPress={props.onDelete} /> : <TextAction label="신고" onPress={props.onReport} />}
            </Row>
          </>
        )}
      </Stack>
    </View>
  );
}

function TextAction({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} hitSlop={10} accessibilityRole="button" style={({ pressed }) => pressed && { opacity: press }}>
      <AppText size="caption" color={c.fgFaint}>
        {label}
      </AppText>
    </Pressable>
  );
}

const s = StyleSheet.create({
  back: { height: hit.min, justifyContent: 'center' },
  action: { flexDirection: 'row', alignItems: 'center', gap: sp[1], minHeight: hit.min },
  comment: { flexDirection: 'row', gap: sp[2] },
  reply: { paddingLeft: sp[4] },
  replyMark: { marginTop: 2 },
});
