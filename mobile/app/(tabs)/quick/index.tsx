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
  // **state가 아니라 ref다** — 저장이 겹쳐 돌 때 둘 다 아직 null을 읽어 기록이 두 건으로 갈라지지 않게(`/record`와 같다)
  const dreamId = useRef<string | null>(null);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const [savedText, setSavedText] = useState<string | null>(null);
  const saved = savedText !== null && savedText === text;

  const persist = useCallback((body: string) => {
    const run = queue.current.then(async () => {
      const repo = await getDreamRepo();
      if (dreamId.current) {
        await repo.update(dreamId.current, { text: body });
        return;
      }
      const created = await repo.create({ text: body });
      dreamId.current = created.id;
    });
    queue.current = run.catch(() => {});
    return run;
  }, []);

  // 화면에 들어올 때마다 센다. 꿈 로그에서 확인하고 돌아오면 줄어 있어야 한다
  const countUnread = useCallback(() => {
    getDreamRepo()
      .then((repo) => repo.counts())
      .then((n) => setUnread(n.unread))
      .catch(() => setUnread(0));
  }, []);

  // 떠날 때는 기다리지 않고 바로 저장한다. 탭을 옮기는 순간 1.2초가 안 지났으면 마지막 몇 글자를 잃는다
  const latest = useRef({ text, saved });
  useEffect(() => {
    latest.current = { text, saved };
  }, [text, saved]);
  useFocusEffect(
    useCallback(() => {
      countUnread();
      return () => {
        const { text: t, saved: done } = latest.current;
        if (t.trim() && !done) void persist(t).then(() => setSavedText(t)).catch(() => {});
      };
    }, [countUnread, persist]),
  );

  useEffect(() => {
    if (!text.trim() || saved) return;
    const t = setTimeout(() => {
      persist(text)
        .then(() => setSavedText(text))
        .catch(() => showToast('기록을 저장하지 못했어요. 잠시 뒤 다시 적어 주세요.'));
    }, IDLE_SAVE_MS);
    return () => clearTimeout(t);
  }, [text, saved, persist]);

  /** 적던 것을 마저 저장하고 칸을 비운다. 다음에 적는 것은 새 기록이 된다 */
  const finish = async () => {
    const t = text;
    try {
      if (t.trim()) await persist(t);
    } catch {
      showToast('기록을 저장하지 못했어요. 다시 눌러 주세요.');
      return;
    }
    dreamId.current = null;
    setText('');
    setSavedText(null);
    Keyboard.dismiss();
    if (t.trim()) {
      savedFeedback();
      showToast('꿈 로그에 남겼어요.', 'neutral');
      countUnread();
    }
  };

  /** 말하기. 적던 것이 있으면 그 기록을 먼저 마무리한다 — 녹음은 새 기록이 된다 */
  const speak = async () => {
    await finish();
    router.push('/record?mode=voice');
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
