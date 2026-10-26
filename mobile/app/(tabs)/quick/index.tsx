import { useFocusEffect, useRouter } from 'expo-router';
import { ChevronRight, Mic } from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Keyboard, Pressable, StyleSheet, View } from 'react-native';

import { Button, Input, Screen, showToast, Title } from '@components';
import { MAX_TEXT_LENGTH } from '@shared/api/sync';
import { getDreamRepo } from '@shared/db';
import { savedFeedback } from '@shared/haptics';
import { AppText } from '@shared/ui';
import { c, hit, press, r, sp } from '@theme/token';

/** 적다가 멈추면 이만큼 뒤에 저장한다. 새벽 적기 화면(`/record`)과 같은 값이다 */
const IDLE_SAVE_MS = 1200;

/**
 * REC-1. **낮에, 의식적으로** 여는 화면이다(이슈 #139, 098 사용자 결정 D1 A · D2).
 *
 * - **적기는 이 화면에서 바로 한다.** 전에는 「적기」를 누르면 새벽 적기 화면으로 옮겨 갔는데, 낮에는 그 한 번의 이동이
 *   군더더기였다. 새벽 적기 화면처럼 멈추면 저장되고, 「완료」는 입력칸을 비워 다음 기록을 받는다.
 * - **말하기는 화면 아래 엄지 자리다.** 버튼이 제목 바로 아래 있어 손을 멀리 뻗어야 했다. 새벽 녹음 화면의 정지 버튼과
 *   같은 크기의 둥근 버튼이라, 낮에 누르는 자리와 새벽에 누르는 자리가 같다.
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

  // 적는 중인 기록. 첫 저장에서 만들고 그 뒤로는 같은 기록을 고친다.
  // **state가 아니라 ref다** — 저장이 겹쳐 돌 때 둘 다 아직 null을 읽어 기록이 두 건으로 갈라지지 않게(`/record`와 같다).
  // 「완료」로 칸을 비우면 다음 글은 새 기록이라 **판(`gen`)을 하나 올린다.** 저장은 부를 때의 판을 붙들고 가서
  // 그 판의 기록에만 쓴다 — 「완료」와 겹친 대기 저장 · 탭 떠날 때 저장이 이미 끝낸 글로 새 기록을 만들지 않게(PR #140 리뷰)
  const gen = useRef(0);
  const ids = useRef(new Map<number, string>());
  /** 판마다 마지막으로 쓴 글. 다른 화면(꿈 로그 · 상세)에서 그 기록을 고쳤는지 알아보는 데 쓴다 */
  const written = useRef(new Map<number, string>());
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const [savedText, setSavedText] = useState<string | null>(null);
  const saved = savedText !== null && savedText === text;

  const persist = useCallback((body: string, g: number) => {
    const run = queue.current.then(async () => {
      const repo = await getDreamRepo();
      const id = ids.current.get(g);
      if (id) await repo.update(id, { text: body });
      else ids.current.set(g, (await repo.create({ text: body })).id);
      written.current.set(g, body);
    });
    queue.current = run.catch(() => {});
    return run;
  }, []);

  // 떠날 때는 기다리지 않고 바로 저장한다. 탭을 옮기는 순간 1.2초가 안 지났으면 마지막 몇 글자를 잃는다
  const latest = useRef({ text, saved, g: 0 });
  useEffect(() => {
    latest.current = { text, saved, g: gen.current };
  }, [text, saved]);

  /** 저장이 끝났다고 표시한다. 「완료」로 판이 바뀐 뒤 늦게 끝난 앞 판의 저장은 새 칸의 「저장됨」을 건드리지 않는다 */
  const markSaved = useCallback((t: string, g: number) => {
    if (g === gen.current) setSavedText(t);
  }, []);

  // 화면에 들어올 때마다 센다. 꿈 로그에서 확인하고 돌아오면 줄어 있어야 한다
  const countUnread = useCallback(() => {
    getDreamRepo()
      .then((repo) => repo.counts())
      .then((n) => setUnread(n.unread))
      .catch(() => setUnread(0));
  }, []);

  /**
   * 탭이라 이 화면을 둔 채 꿈 로그에서 같은 기록을 지우거나 고칠 수 있다(PR #140 리뷰). 돌아오면 확인한다 —
   * 지웠으면 칸을 비우고 새 판으로, 고쳤으면 고친 글을 칸에 받는다. 안 그러면 지운 기록에 계속 쓰면서 「저장됨」을 띄우거나,
   * 고친 것을 이 칸의 글로 덮는다. 앞에 줄 선 저장이 끝난 뒤에 본다
   */
  const reconcile = useCallback(() => {
    const g = gen.current;
    // 확인하는 사이에 친 글자는 덮지 않는다 — 들어올 때의 글 그대로일 때만 받아온 글로 바꾼다
    const before = latest.current.text;
    queue.current = queue.current.then(async () => {
      const id = ids.current.get(g);
      if (!id || g !== gen.current) return;
      const d = await (await getDreamRepo()).get(id);
      if (g !== gen.current) return;
      if (!d || d.deletedAt) {
        gen.current += 1;
        setText('');
        setSavedText(null);
      } else if ((d.text ?? '') !== written.current.get(g)) {
        const t = d.text ?? '';
        written.current.set(g, t);
        setText((cur) => (cur === before ? t : cur));
        setSavedText(t);
      }
    }).catch(() => {});
  }, []);

  useFocusEffect(
    useCallback(() => {
      countUnread();
      reconcile();
      return () => {
        const { text: t, saved: done, g } = latest.current;
        if (t.trim() && !done) void persist(t, g).then(() => markSaved(t, g)).catch(() => {});
      };
    }, [countUnread, reconcile, persist, markSaved]),
  );

  useEffect(() => {
    if (!text.trim() || saved) return;
    const g = gen.current;
    const t = setTimeout(() => {
      persist(text, g)
        .then(() => markSaved(text, g))
        .catch(() => showToast('기록을 저장하지 못했어요. 잠시 뒤 다시 적어 주세요.'));
    }, IDLE_SAVE_MS);
    return () => clearTimeout(t);
  }, [text, saved, persist, markSaved]);

  /** 「완료」를 연달아 누르면 두 번째가 새 판에서 같은 글로 기록을 하나 더 만든다 */
  const finishing = useRef(false);
  /** 적던 것을 마저 저장하고 칸을 비운다. 다음에 적는 것은 새 기록이 된다. 끝까지 마쳤으면 true */
  const finish = async (): Promise<boolean> => {
    if (finishing.current) return false;
    finishing.current = true;
    const t = text;
    const g = gen.current;
    try {
      if (t.trim()) await persist(t, g);
    } catch {
      showToast('기록을 저장하지 못했어요. 다시 눌러 주세요.');
      return false;
    } finally {
      finishing.current = false;
    }
    // 저장을 기다리는 사이에 더 친 글자가 있으면 칸을 비우지 않는다 — 비우면 그 글자는 저장되지 않는다(PR #140 리뷰).
    // 판은 그대로라 대기 저장이 늘어난 글을 같은 기록에 쓴다
    if (g !== gen.current || latest.current.text !== t) return false;
    gen.current += 1;
    latest.current = { text: '', saved: false, g: gen.current };
    setText('');
    setSavedText(null);
    Keyboard.dismiss();
    if (t.trim()) {
      savedFeedback();
      showToast('꿈 로그에 남겼어요.', 'neutral');
      countUnread();
    }
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
        onFocus={() => setTyping(true)}
        onBlur={() => setTyping(false)}
        style={s.input}
      />

      {!!text.trim() && (
        <View style={{ gap: sp[2] }}>
          <Button label="완료" onPress={() => void finish()} />
          <AppText size="caption" color={c.fgFaint} style={{ textAlign: 'center' }}>
            {saved ? '저장됨' : '멈추면 저장돼요'}
          </AppText>
        </View>
      )}

      {/* 빈 자리를 누르면 키보드가 내려간다. 여러 줄 입력이라 엔터로는 못 내린다 */}
      <Pressable style={{ flex: 1 }} onPress={Keyboard.dismiss} accessible={false} />

      {!typing && (
        <View style={s.speak}>
          <Pressable
            onPress={() => void speak()}
            accessibilityRole="button"
            accessibilityLabel="말해서 남기기"
            style={({ pressed }) => [s.mic, pressed && { opacity: press }]}>
            <Mic size={32} strokeWidth={2} color={c.actionFg} aria-hidden />
          </Pressable>
          <AppText size="caption" color={c.fgMuted}>
            눌러서 말하기
          </AppText>
          <AppText size="caption" color={c.fgFaint} style={{ textAlign: 'center' }}>
            새벽에는 잠금화면에서 바로 열려요. 이 화면을 거치지 않아요
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
  speak: { alignItems: 'center', gap: sp[2], paddingBottom: sp[4] },
  mic: {
    width: hit.stop,
    height: hit.stop,
    borderRadius: r.chip,
    backgroundColor: c.action,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
