import { useLocalSearchParams, useRouter } from 'expo-router';
import { Trash2 } from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet } from 'react-native';

import { Badge, Button, Input, Row, Screen, Sheet, Stack } from '@components';
import { PlayerBar } from '@features/log/PlayerBar';
import { getDreamRepo, nowIso, type Dream } from '@shared/db';
import { AppText } from '@shared/ui';
import { c, sp } from '@theme/token';

/** 입력이 이만큼 멈추면 저장한다. 기록 화면과 같은 값이라 감각이 어긋나지 않는다 */
const IDLE_SAVE_MS = 1200;

/**
 * LOG-2. 기록 하나를 열어 보는 화면.
 *
 * **저장 버튼이 없다.** 기록 화면이 자동저장인데 여기만 버튼이 있으면
 * "저장을 눌렀나?"라는 불안이 생기고, 그 불안은 새벽이 아니라 낮에 쌓인다.
 *
 * 여기서 LOG-3(확인·보완)의 일도 같이 한다 — 제목을 붙이고 본문을 다듬은 뒤
 * `확인함`을 누르면 목록의 미확인 배지가 사라진다. 화면을 둘로 나누면
 * 같은 내용을 두 번 보게 되고, 실제로 하는 일은 제목과 본문 손질 하나다.
 */
export default function DreamDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const [dream, setDream] = useState<Dream | null>(null);
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [saved, setSaved] = useState<{ title: string; text: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [askDelete, setAskDelete] = useState(false);

  const dirty = saved !== null && (saved.title !== title || saved.text !== text);

  useEffect(() => {
    let alive = true;
    getDreamRepo()
      .then((repo) => repo.get(id))
      .then((d) => {
        if (!alive) return;
        setDream(d);
        setTitle(d?.title ?? '');
        setText(d?.text ?? '');
        setSaved({ title: d?.title ?? '', text: d?.text ?? '' });
      })
      .catch((e) => alive && setError(String(e)));
    return () => {
      alive = false;
    };
  }, [id]);

  // 저장을 한 줄로 세운다. 기록 화면과 같은 이유다 — 겹쳐 돌면 마지막 것만 남는 게 아니라
  // 먼저 끝난 것이 나중 것을 덮을 수 있다
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const save = useCallback(
    (patch: Partial<Pick<Dream, 'title' | 'text' | 'reviewedAt'>>) => {
      const run = queue.current.then(async () => {
        const repo = await getDreamRepo();
        return repo.update(id, patch);
      });
      queue.current = run.catch(() => {});
      return run;
    },
    [id],
  );

  // 멈추면 저장한다
  useEffect(() => {
    if (saved === null) return;
    if (saved.title === title && saved.text === text) return;
    const t = setTimeout(() => {
      save({ title: title.trim() || null, text })
        .then(() => setSaved({ title, text }))
        .catch((e) => setError(String(e)));
    }, IDLE_SAVE_MS);
    return () => clearTimeout(t);
  }, [title, text, saved, save]);

  const review = () => {
    save({ title: title.trim() || null, text, reviewedAt: nowIso() })
      .then((d) => {
        setSaved({ title, text });
        setDream(d);
      })
      .catch((e) => setError(String(e)));
  };

  const remove = () => {
    void (async () => {
      try {
        const repo = await getDreamRepo();
        await repo.softDelete(id);
        router.replace('/log');
      } catch (e) {
        setError(String(e));
      }
    })();
  };

  if (dream === null) {
    return (
      <Screen>
        <AppText color={c.fgMuted}>{error ?? '불러오는 중입니다'}</AppText>
        <Button label="목록으로" variant="ghost" onPress={() => router.replace('/log')} />
      </Screen>
    );
  }

  const unread = dream.reviewedAt == null;

  return (
    <Screen scroll>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {/* 덩어리 사이를 넉넉히 띄운다. 읽는 것 · 듣는 것 · 결정하는 것이
            같은 간격으로 붙어 있으면 화면이 목록처럼 읽힌다 */}
        <Stack gap={sp[6]}>
          <Row>
            <AppText size="caption" color={c.fgFaint} style={{ flex: 1 }}>
              {dream.recordedAt.slice(0, 16).replace('T', ' ')}
            </AppText>
            {unread ? <Badge label="미확인" tone="running" /> : <Badge label="확인함" tone="neutral" />}
          </Row>

          <Stack gap={sp[3]}>
            {/* 서버가 255자를 넘는 제목을 거절한다(title_too_long). 거절된 수정은 폰에만 남아
                다른 기기의 늦은 수정에 덮일 수 있어서, 입력에서 막아 그 경로를 없앤다(문서 035) */}
            <Input
              placeholder="제목을 붙여 보세요"
              value={title}
              onChangeText={setTitle}
              maxLength={255}
            />
            <Input
              multiline
              placeholder="기억나는 것을 적어 두세요"
              value={text}
              onChangeText={setText}
            />
            <AppText size="caption" color={error ? c.danger : c.fgFaint}>
              {error ?? (dirty ? '나가면 저장됩니다' : '저장됨')}
            </AppText>
          </Stack>

          {/* 읽어 보고 → 이상하면 들어 보고 → 확인함. 그 순서대로 놓는다.
              STT가 붙는 6주차에는 이 자리가 더 맞는다 — 틀린 텍스트를 고치려고
              원본을 찾는 흐름이 곧 "확인"이기 때문이다 (절대 규칙 2) */}
          {!!dream.audioPath && <PlayerBar uri={dream.audioPath} durationMs={dream.durationMs} />}

          <Stack gap={sp[2]}>
            {unread && <Button label="확인함으로 표시" onPress={review} />}
            <Pressable
              onPress={() => setAskDelete(true)}
              accessibilityRole="button"
              style={({ pressed }) => [s.delete, pressed && { opacity: 0.7 }]}>
              <Trash2 size={16} strokeWidth={1.75} color={c.fgFaint} />
              <AppText size="caption" color={c.fgFaint}>
                이 기록 지우기
              </AppText>
            </Pressable>
          </Stack>
        </Stack>
      </KeyboardAvoidingView>

      {/* 지우는 것은 되돌리기 어렵다. 기록 유실이 이 앱에서 유일하게 용납되지 않는 실패라
          여기만 확인을 한 번 받는다 — 새벽 화면이 아니라 낮 화면이므로 규칙 7에 걸리지 않는다 */}
      <Sheet visible={askDelete} onClose={() => setAskDelete(false)}>
        {/* 묻는 말과 그 설명은 붙이고, 답하는 버튼은 떼어 놓는다.
            같은 간격으로 늘어놓으면 설명을 읽기 전에 손이 먼저 간다 */}
        <Stack gap={sp[6]}>
          <Stack gap={sp[2]}>
            <AppText size="heading" weight="bold">
              이 기록을 지울까요
            </AppText>
            <AppText size="caption" color={c.fgMuted}>
              목록에서만 사라지고 서버에는 남습니다. 나중에 되살릴 수 있습니다.
            </AppText>
          </Stack>
          <Stack gap={sp[2]}>
            <Button label="지우기" variant="danger" onPress={remove} />
            <Button label="그만두기" variant="ghost" onPress={() => setAskDelete(false)} />
          </Stack>
        </Stack>
      </Sheet>
    </Screen>
  );
}

const s = StyleSheet.create({
  delete: { flexDirection: 'row', alignItems: 'center', gap: sp[2], alignSelf: 'center', paddingVertical: sp[3] },
});
