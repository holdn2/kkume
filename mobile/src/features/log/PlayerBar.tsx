import { Pause, Play } from 'lucide-react-native';
import { Pressable, StyleSheet, View } from 'react-native';

import { Row } from '@components';
import { mmss, usePlayer } from '@shared/audio';
import { AppText } from '@shared/ui';
import { c, hit, press, r, sp } from '@theme/token';

const TRACK_H = 6;

/**
 * 원본 오디오를 듣는 줄.
 *
 * **STT가 틀려도 원본이 있으면 복원된다**(절대 규칙 2). 그래서 이 줄은 부가 기능이 아니라
 * 기록의 마지막 보루이고, 상세 화면에서 텍스트보다 위에 있다.
 *
 * 막대를 끌어서 옮기는 것은 넣지 않았다. 새벽에 쓰는 화면이 아니라 낮 화면이지만,
 * 여기서 필요한 것은 "다시 들어보기"이지 편집이 아니다. 탭으로 위치를 옮기는 것만 둔다.
 */
export function PlayerBar({ uri, durationMs }: { uri: string | null; durationMs: number | null }) {
  const player = usePlayer(uri, durationMs);
  const Icon = player.playing ? Pause : Play;

  return (
    <Row gap={sp[3]}>
      <Pressable
        onPress={player.toggle}
        accessibilityRole="button"
        accessibilityLabel={player.playing ? '일시정지' : '재생'}
        style={({ pressed }) => [s.button, pressed && { opacity: press }]}>
        <Icon size={20} strokeWidth={2} color={c.actionFg} fill={c.actionFg} />
      </Pressable>

      <View style={{ flex: 1, gap: sp[2] }}>
        {/* 막대 어디를 눌러도 그 지점으로 간다. 폭을 재서 비율로 바꾼다 */}
        <Pressable
          onPress={(e) => {
            const { locationX } = e.nativeEvent;
            e.currentTarget.measure?.((_x, _y, w) => {
              if (w > 0) player.seek(Math.max(0, Math.min(1, locationX / w)));
            });
          }}
          hitSlop={12}
          accessibilityRole="adjustable"
          accessibilityLabel="재생 위치">
          <View style={s.track}>
            <View style={[s.fill, { width: `${Math.round(player.progress * 100)}%` }]} />
          </View>
        </Pressable>

        <Row>
          <AppText size="caption" color={c.fgFaint} style={{ flex: 1 }}>
            {mmss(player.positionMs)}
          </AppText>
          {/* 길이가 0이면 "0초짜리 녹음"이 아니라 **못 읽은 것**이다 —
              마무리되지 않은 파일은 헤더가 없어 길이가 안 나온다.
              `00:00`으로 그리면 멀쩡한 0초 녹음처럼 읽혀서 `--:--`로 둔다
              (같은 이유가 `mmss`의 주석에 있다) */}
          <AppText size="caption" color={c.fgFaint}>
            {mmss(player.durationMs || null)}
          </AppText>
        </Row>
      </View>
    </Row>
  );
}

const s = StyleSheet.create({
  button: {
    width: hit.min,
    height: hit.min,
    borderRadius: r.chip,
    backgroundColor: c.action,
    alignItems: 'center',
    justifyContent: 'center',
  },
  track: { height: TRACK_H, borderRadius: r.chip, backgroundColor: c.raised, overflow: 'hidden' },
  // 재생 중은 "진행 중"이다 — 절대 규칙 5의 청록이 여기 해당한다
  fill: { height: '100%', borderRadius: r.chip, backgroundColor: c.running },
});
