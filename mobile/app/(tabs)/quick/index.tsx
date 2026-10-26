import { useFocusEffect, useRouter } from 'expo-router';
import { ChevronRight, Mic } from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Keyboard, Pressable, StyleSheet, View } from 'react-native';

import { Button, Input, Screen, showToast, Title } from '@components';
import { MAX_TEXT_LENGTH } from '@shared/api/sync';
import { getDreamRepo, SETTINGS } from '@shared/db';
import { savedFeedback } from '@shared/haptics';
import { AppText } from '@shared/ui';
import { c, hit, press, r, sp } from '@theme/token';

/** 적다가 멈추면 이만큼 뒤에 쓰던 글을 폰에 따로 적어 둔다(기록이 아니다) */
const DRAFT_SAVE_MS = 1200;

/**
 * REC-1. **낮에, 의식적으로** 여는 화면이다(이슈 #139, 098 사용자 결정 D1 A · D2).
 *
 * - **적기는 이 화면에서 바로 한다.** 전에는 「적기」를 누르면 새벽 적기 화면으로 옮겨 갔는데, 낮에는 그 한 번의 이동이
 *   군더더기였다.
 * - **「완료」를 눌러야 기록이 된다**(이슈 #143, 099 B4 사용자 결정). 새벽 적기(`/record`)는 멈추면 저장하지만, 낮에는
 *   적다 마는 글이 기록으로 쌓이지 않게 한다. 「완료」는 칸을 비워 다음 기록을 받는다.
 *   다만 **쓰던 글은 폰에 따로 적어 둔다**(`SETTINGS.quickDraft`, 기록 아님) — 「완료」 전에 앱이 꺼져도 다시 열면 칸에 남아 있다.
 *   탭을 오가는 동안 칸에 글이 남는 것과 같은 모습을 앱이 꺼진 뒤에도 지키는 것이다(절대 규칙 1).
 * - **말하기는 화면 아래 엄지 자리다.** 버튼이 제목 바로 아래 있어 손을 멀리 뻗어야 했다. 새벽 녹음 화면의 정지 버튼처럼
 *   아래쪽의 둥근 버튼이라, 낮에 누르는 자리와 새벽에 누르는 자리가 같다. 크기는 정지 버튼보다 크다(이슈 #141 · #143).
 * - 위젯 안내 줄(「새벽에는 잠금화면에서 바로 열려요」)은 뺐다(098 D3 사용자 결정).
 * - 확인 안 한 기록이 있으면 한 줄로 알려 주고 누르면 꿈 로그로 간다. 「마지막 기록」은 넣지 않았다(사용자 결정).
 *
 * 새벽에는 잠금화면 위젯이 `/record`를 바로 열어 이 화면을 거치지 않는다.
 */
export default function QuickRecordScreen() {
  const router = useRouter();
  const [text, setText] = useState('');
  const [unread, setUnread] = useState(0);
  // 적는 동안은 확인 안 한 기록 줄과 아래 마이크를 접는다. Android 는 키보드만큼 화면이 줄어 마이크가 입력칸 · 「완료」를
  // 밀어 올리고, 작은 iPhone 은 키보드 위에 「완료」까지 들어갈 자리가 빠듯하다
  const [typing, setTyping] = useState(false);
  /** 「완료」가 기록을 쓰는 중. 그동안 칸을 잠근다 — 쓰는 사이에 친 글자가 칸을 비울 때 같이 사라지지 않게 */
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);

  // 쓰던 글을 되살린다. 처음 한 번만 — 그 뒤로는 칸이 원본이다.
  // **state다**(PR #144 리뷰) — 되살리기가 끝나기 전에 친 글은 끝난 뒤에 적어 두기를 다시 예약해야 한다
  const [restored, setRestored] = useState(false);
  useEffect(() => {
    getDreamRepo()
      .then((repo) => repo.getSetting(SETTINGS.quickDraft))
      .then((d) => {
        if (d) setText((cur) => cur || d);
      })
      .catch(() => {})
      .finally(() => setRestored(true));
  }, []);

  /** 쓰던 글을 적어 둔다. 앞의 쓰기가 끝난 뒤에 쓴다 — 늦게 끝난 옛 글이 새 글을 덮지 않게 */
  const draftQueue = useRef<Promise<unknown>>(Promise.resolve());
  const writeDraft = useCallback((t: string) => {
    draftQueue.current = draftQueue.current
      .then(async () => (await getDreamRepo()).setSetting(SETTINGS.quickDraft, t))
      .catch(() => {});
    return draftQueue.current;
  }, []);

  useEffect(() => {
    if (!restored || busy) return;
    const t = setTimeout(() => void writeDraft(text), DRAFT_SAVE_MS);
    // 앱이 뒤로 가면 기다리지 않고 적어 둔다. 1.2초 안에 앱을 닫으면 마지막 글자를 잃는다(PR #144 리뷰)
    const sub = AppState.addEventListener('change', (st) => {
      if (st !== 'active') void writeDraft(text);
    });
    return () => {
      clearTimeout(t);
      sub.remove();
    };
  }, [text, busy, restored, writeDraft]);

  // 화면에 들어올 때마다 센다. 꿈 로그에서 확인하고 돌아오면 줄어 있어야 한다
  const countUnread = useCallback(() => {
    getDreamRepo()
      .then((repo) => repo.counts())
      .then((n) => setUnread(n.unread))
      .catch(() => setUnread(0));
  }, []);

  // 떠날 때는 기다리지 않고 쓰던 글을 적어 둔다. 탭을 옮기고 곧바로 앱을 닫아도 남게
  const latest = useRef({ text, restored });
  useEffect(() => {
    latest.current = { text, restored };
  }, [text, restored]);
  useFocusEffect(
    useCallback(() => {
      countUnread();
      return () => {
        if (latest.current.restored && !busyRef.current) void writeDraft(latest.current.text);
      };
    }, [countUnread, writeDraft]),
  );

  /** 적은 것을 기록으로 남기고 칸을 비운다. 다음에 적는 것은 새 기록이 된다. 끝까지 마쳤으면 true */
  const finish = async (): Promise<boolean> => {
    if (busyRef.current) return false;
    const t = text;
    if (!t.trim()) return true;
    busyRef.current = true;
    setBusy(true);
    try {
      const repo = await getDreamRepo();
      await repo.create({ text: t });
      // 기록이 된 뒤에 쓰던 글을 지운다. 순서가 바뀌면 그 사이에 꺼질 때 글이 어디에도 없다.
      // `writeDraft`는 실패를 삼킨다 — 지우기가 실패해도 기록은 이미 남았으니 「완료」를 실패로 돌리지 않는다.
      // 칸이 비면 적어 두기가 빈 글을 한 번 더 쓰므로 그때 다시 지워진다
      await writeDraft('');
    } catch {
      showToast('기록을 남기지 못했어요. 다시 눌러 주세요.');
      return false;
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
    latest.current = { text: '', restored: true };
    setText('');
    Keyboard.dismiss();
    savedFeedback();
    showToast('꿈 로그에 남겼어요.', 'neutral');
    countUnread();
    return true;
  };

  /** 말하기. 적던 것이 있으면 그 기록을 먼저 마무리한다 — 녹음은 새 기록이 된다. 마무리하지 못했으면 이 화면에 남는다 */
  const speak = async () => {
    if (await finish()) router.push('/record?mode=voice');
  };

  return (
    <Screen>
      <Title sub="말해도 되고 적어도 돼요">무엇을 남길까요</Title>

      {unread > 0 && !typing && (
        <Pressable
          onPress={() => router.navigate('/log')}
          accessibilityRole="button"
          accessibilityLabel={`확인 안 한 기록 ${unread}건, 꿈 로그로 가요`}
          style={({ pressed }) => [s.unread, pressed && { opacity: press }]}>
          <View style={s.dot} />
          <AppText size="caption" color={c.fgMuted} style={{ flex: 1 }}>
            확인 안 한 기록 {unread}건
          </AppText>
          <ChevronRight size={16} strokeWidth={1.75} color={c.fgFaint} />
        </Pressable>
      )}

      <Input
        multiline
        value={text}
        onChangeText={setText}
        placeholder="적어서 남기기 — 기억나는 것부터"
        maxLength={MAX_TEXT_LENGTH}
        accessibilityLabel="꿈 적기"
        editable={!busy}
        onFocus={() => setTyping(true)}
        onBlur={() => setTyping(false)}
        style={s.input}
      />

      {!!text.trim() && <Button label="완료" loading={busy} onPress={() => void finish()} />}

      {/* 빈 자리를 누르면 키보드가 내려간다. 여러 줄 입력이라 엔터로는 못 내린다 */}
      <Pressable style={{ flex: 1 }} onPress={Keyboard.dismiss} accessible={false} />

      {!typing && (
        <View style={s.speak}>
          <Pressable
            onPress={() => void speak()}
            accessibilityRole="button"
            accessibilityLabel="말해서 남기기"
            style={({ pressed }) => [s.mic, pressed && { opacity: press }]}>
            <Mic size={52} strokeWidth={2} color={c.actionFg} aria-hidden />
          </Pressable>
          <AppText size="body" weight="semibold" color={c.fgMuted}>
            눌러서 말하기
          </AppText>
        </View>
      )}
    </Screen>
  );
}

const s = StyleSheet.create({
  unread: { flexDirection: 'row', alignItems: 'center', gap: sp[2], minHeight: hit.min },
  dot: { width: 8, height: 8, borderRadius: r.chip, backgroundColor: c.running },
  // 낮 화면이라 새벽 적기처럼 남은 자리를 다 쓰지 않는다. 키보드를 내리면 아래 마이크가 늘 보여야 하고,
  // 키보드를 올리면 그 위에 「완료」까지 들어가야 한다 — iPhone SE(667pt)에서 제목 · 「완료」를 빼고 남는 자리가 약 190이다
  input: { minHeight: 120, maxHeight: 160 },
  // 아래는 탭바와 한 뼘 띄운다 — 바짝 붙으면 마이크를 누르려다 탭을 누른다(이슈 #141)
  speak: { alignItems: 'center', gap: sp[3], paddingBottom: sp[10] },
  mic: {
    width: hit.speak,
    height: hit.speak,
    borderRadius: r.chip,
    backgroundColor: c.action,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
