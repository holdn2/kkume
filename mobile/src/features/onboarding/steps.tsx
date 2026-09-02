import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button, Card, Row, Stack } from '@components';
import { mmss, useRecorder } from '@shared/audio';
import { AppText } from '@shared/ui';
import { c, r, sp } from '@theme/token';

import { Waveform } from '../record/Waveform';

/**
 * 온보딩 각 장. **화면이 아니라 장(章)이다** — 라우트는 `app/onboarding.tsx` 하나이고
 * 여기 있는 것들이 그 안에서 갈아 끼워진다.
 *
 * 라우트를 장마다 두지 않는 이유는 둘이다. 타입드 라우트를 매번 재생성해야 하고,
 * 뒤로 가기가 스택에 쌓여 **새벽 흐름과 섞인다** — 온보딩은 낮에 한 번 지나가는 길이다.
 */

/**
 * ON-2. 이 앱이 무엇을 해결하는지 한 장으로.
 *
 * **단계 비교는 점(·)에서만 줄이 바뀌어야 한다.** 그냥 두면 두 가지가 겹쳐 일어난다 —
 * 한글은 기본 줄바꿈에서 **글자 사이 아무 데서나** 끊기고("잠금
해제"가 아니라 "잠
금해제"),
 * 띄어쓰기에서도 끊겨 한 단계가 두 줄에 걸린다. 그러면 단계를 세는 것 자체가 어려워지는데,
 * 이 화면은 **단계 수를 비교하는 것이 전부**다.
 *
 * 그래서 둘을 같이 쓴다 — 단계 안의 띄어쓰기는 줄바꿈 없는 공백(`\u00A0`)으로 묶고,
 * `lineBreakStrategyIOS="hangul-word"`로 낱자 사이가 끊기는 것을 막는다.
 */
export function Value() {
  return (
    <Stack gap={sp[5]}>
      <AppText size="display" weight="bold">
        일어나자마자{'\n'}3초 만에
      </AppText>
      <AppText size="body" color={c.fgMuted}>
        꿈은 깨고 나서 몇 분이면 사라집니다.{'\n'}
        메모 앱을 여는 동안 이미 지워집니다.
      </AppText>

      <Card>
        <Stack gap={sp[3]}>
          <Row gap={sp[3]} style={s.compare}>
            <AppText size="caption" color={c.fgFaint} style={s.num}>
              지금
            </AppText>
            <AppText size="label" color={c.fgMuted} style={{ flex: 1 }} lineBreakStrategyIOS="hangul-word">
              {'폰\u00A0집기 · 앱\u00A0찾기 · 열기 · 새\u00A0메모'}
            </AppText>
          </Row>
          <Row gap={sp[3]} style={s.compare}>
            <AppText size="caption" color={c.running} style={s.num}>
              꾸메
            </AppText>
            <AppText size="label" style={{ flex: 1 }} lineBreakStrategyIOS="hangul-word">
              {'폰\u00A0집기 · '}
              <AppText weight="semibold">{'잠금화면에서\u00A0바로\u00A0누르기'}</AppText>
            </AppText>
          </Row>
        </Stack>
      </Card>
    </Stack>
  );
}

/**
 * ON-6. 리허설. **여기서 마이크 권한이 처음 요청된다.**
 *
 * 계획서가 이 장을 P0로 둔 이유는 권한 때문만이 아니다 —
 * 새벽에 처음 해 보면 그날 기록을 놓친다. 낮에 한 번 겪어 둬야 몸이 안다.
 */
export function Rehearsal({ onDone }: { onDone: () => void }) {
  const rec = useRecorder();
  const { start, stop } = rec;
  const [state, setState] = useState<'idle' | 'recording' | 'done'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [heard, setHeard] = useState(0);

  // 소리가 실제로 들어왔는지 센다. **권한만 받고 마이크가 죽어 있는 경우를 가르려는 것이다** —
  // "허용"을 눌렀다고 소리가 들어오는 것은 아니고, 그 차이는 새벽에야 드러난다.
  //
  // 레벨이 바뀔 때마다 세지 않고 **자기 박자로 센다.** 파형과 같은 이유다 —
  // 녹음기의 폴링 주기가 곧 세는 주기가 되면, 그 주기를 바꾸는 순간 기준이 같이 움직인다.
  const latest = useRef(rec.level);
  useEffect(() => {
    latest.current = rec.level;
  }, [rec.level]);

  useEffect(() => {
    if (state !== 'recording') return;
    const t = setInterval(() => {
      if (latest.current > 0.15) setHeard((n) => n + 1);
    }, 200);
    return () => clearInterval(t);
  }, [state]);

  const begin = () => {
    setError(null);
    void start()
      .then(() => setState('recording'))
      .catch((e) => setError(String(e)));
  };

  const finish = () => {
    void stop()
      .then(() => setState('done'))
      .catch((e) => setError(String(e)));
  };

  return (
    <Stack gap={sp[5]}>
      <AppText size="title" weight="bold">
        한 번 해 볼까요
      </AppText>
      <AppText size="body" color={c.fgMuted}>
        {state === 'done'
          ? '이게 전부입니다. 새벽에는 이 화면이 바로 열립니다.'
          : '아무 말이나 좋습니다. "어젯밤에 바다에 있었어" 처럼요.'}
      </AppText>

      <View style={s.stage}>
        {state === 'recording' ? (
          <Stack gap={sp[4]}>
            <AppText size="display" weight="bold" color={c.running} style={{ textAlign: 'center' }}>
              {mmss(rec.durationMs)}
            </AppText>
            <Waveform level={rec.level} active />
          </Stack>
        ) : (
          <AppText size="body" color={c.fgFaint} style={{ textAlign: 'center' }}>
            {state === 'done' ? (heard > 3 ? '잘 들렸습니다' : '소리가 거의 안 들어왔습니다') : ' '}
          </AppText>
        )}
      </View>

      {!!error && (
        <Card>
          <AppText size="caption" color={c.danger}>
            {error}
          </AppText>
          <AppText size="caption" color={c.fgMuted}>
            설정 → 꾸메 → 마이크를 켜 주세요. 지금 건너뛰어도 나중에 다시 할 수 있습니다.
          </AppText>
        </Card>
      )}

      {state === 'idle' && <Button label="녹음 시작" onPress={begin} />}
      {state === 'recording' && <Button label="정지" variant="secondary" onPress={finish} />}
      {state === 'done' && <Button label="다음" onPress={onDone} />}
    </Stack>
  );
}

/**
 * ON-7. **최대 이탈 지점이다.**
 *
 * iOS 잠금화면 위젯은 사용자가 직접 여섯 단계를 밟아야 하고, 안 깔면 이 앱의
 * 핵심 가치가 0이 된다. 계획서 7장이 "텍스트로 설명하면 아무도 하지 않는다"고
 * 못박아 뒀으므로 **이미지나 짧은 영상이 들어가야 한다** — 지금은 자리를 비워 두고
 * 실제 화면을 찍어 채운다. 마이페이지에서 다시 열 수 있다.
 */
export function InstallWidget() {
  return (
    <Stack gap={sp[5]}>
      <AppText size="title" weight="bold">
        잠금화면에 올려 두세요
      </AppText>
      <AppText size="body" color={c.fgMuted}>
        이걸 해 두지 않으면 새벽에 앱을 찾아 열어야 합니다.{'\n'}
        한 번만 하면 됩니다.
      </AppText>

      <Card>
        <Stack gap={sp[3]}>
          {[
            '잠금화면을 길게 누릅니다',
            '아래쪽 사용자 지정을 누릅니다',
            '잠금 화면을 고릅니다',
            '시계 아래 칸을 누릅니다',
            '목록에서 꾸메를 찾습니다',
            '꿈 기록을 넣고 완료를 누릅니다',
          ].map((line, i) => (
            <Row key={line} gap={sp[3]} style={s.compare}>
              <AppText size="caption" color={c.running} style={s.num}>
                {i + 1}
              </AppText>
              <AppText size="label" style={{ flex: 1 }}>
                {line}
              </AppText>
            </Row>
          ))}
        </Stack>
      </Card>

      <Card>
        <AppText size="caption" color={c.fgMuted}>
          위젯을 누르면 <AppText size="caption" weight="semibold">잠금 해제가 필요합니다.</AppText>{'\n'}
          얼굴 인식이라 보통은 그냥 열리지만, 새벽에 눈이 덜 떠져 실패하면 암호를 묻습니다.
          그때는 당황하지 말고 그대로 누르세요.
        </AppText>
      </Card>
    </Stack>
  );
}

const s = StyleSheet.create({
  num: { minWidth: 28, textAlign: 'center', lineHeight: 22 },
  // 옆 글이 두 줄로 넘어가면 Row의 기본 세로 가운데 정렬 때문에 라벨이 가운데로 내려간다.
  // 라벨은 문단의 머리라서 첫 줄에 붙어 있어야 한다
  compare: { alignItems: 'flex-start' },
  stage: { minHeight: 96, justifyContent: 'center', borderRadius: r.surface },
});
