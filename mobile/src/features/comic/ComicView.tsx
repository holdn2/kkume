import { Image } from 'expo-image';
import { useState } from 'react';
import { Pressable, StyleSheet, View, type LayoutChangeEvent } from 'react-native';

import type { ComicLayout, ComicPanel } from '@shared/api/comic';
import { AppText } from '@shared/ui';
import { avatarBg, c, press, r, sp } from '@theme/token';

import { bubbleSide, gridCrop, type BubbleSide } from './logic';

type Props = {
  layout: ComicLayout | null;
  imageUrls: string[];
  panels: ComicPanel[];
  /** 컷을 누르면 크게 본다. 없으면 누를 수 없다 */
  onPressPanel?: (index: number) => void;
};

const GAP = sp[1];

/**
 * CM-3의 네 컷(계획서 003 — "4컷 그리드, 탭하면 전체화면 확대").
 *
 * **글자는 그림 위에 앱이 얹는다**(문서 081). 해설은 컷 아래쪽 띠에, 대사는 위쪽 말풍선에 —
 * 말풍선은 말하는 사람 쪽으로 붙는다(`speaker`).
 * 그림이 없으면(가짜 서버 · 받는 중) 그 자리에 자리 그림을 그린다 — 글자는 그대로 읽힌다.
 */
export function ComicView({ layout, imageUrls, panels, onPressPanel }: Props) {
  const [width, setWidth] = useState(0);
  const cell = width > 0 ? (width - GAP) / 2 : 0;
  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);

  return (
    <View onLayout={onLayout} style={s.grid}>
      {cell > 0 &&
        [0, 1, 2, 3].map((i) => (
          <Pressable
            key={i}
            disabled={!onPressPanel}
            onPress={() => onPressPanel?.(i)}
            accessibilityRole={onPressPanel ? 'button' : undefined}
            accessibilityLabel={`${i + 1}번째 컷${panels[i]?.caption ? `, ${panels[i].caption}` : ''}`}
            style={({ pressed }) => [{ width: cell, height: cell }, pressed && { opacity: press }]}>
            <ComicPanelView index={i} size={cell} layout={layout} imageUrls={imageUrls} panel={panels[i]} />
          </Pressable>
        ))}
    </View>
  );
}

type PanelProps = {
  index: number;
  size: number;
  layout: ComicLayout | null;
  imageUrls: string[];
  panel: ComicPanel | undefined;
  /** 크게 볼 때는 해설을 줄이지 않는다 */
  full?: boolean;
};

/** 컷 하나. 뷰어의 칸과 크게 보기가 함께 쓴다 */
export function ComicPanelView({ index, size, layout, imageUrls, panel, full }: PanelProps) {
  const source = layout === 'grid2x2' ? imageUrls[0] : layout === 'panels4' ? imageUrls[index] : undefined;
  return (
    <View style={[s.panel, { width: size, height: size }]}>
      {source ? (
        layout === 'grid2x2' ? (
          <Image source={source} style={[s.abs, gridCrop(index, size)]} contentFit="cover" />
        ) : (
          <Image source={source} style={StyleSheet.absoluteFill} contentFit="cover" />
        )
      ) : (
        <View style={[StyleSheet.absoluteFill, s.placeholder, { backgroundColor: avatarBg[index % avatarBg.length] }]}>
          <AppText size="display" weight="bold" color={c.fgFaint}>
            {index + 1}
          </AppText>
        </View>
      )}
      {!!panel?.dialogue && <SpeechBubble text={panel.dialogue} side={bubbleSide(panel.speaker)} full={full} />}
      {!!panel?.caption && (
        <View style={s.caption}>
          <AppText size="caption" color={c.fg} numberOfLines={full ? undefined : 3}>
            {panel.caption}
          </AppText>
        </View>
      )}
    </View>
  );
}

/**
 * 말풍선. 말하는 사람 쪽 위에 놓고 꼬리를 그쪽 아래로 뺀다(이슈 #106).
 * 꼬리는 테두리색 삼각형 위에 한 겹 작은 바탕색 삼각형을 겹쳐 테두리가 이어져 보이게 한다
 */
function SpeechBubble({ text, side, full }: { text: string; side: BubbleSide; full?: boolean }) {
  const align = side === 'left' ? 'flex-start' : side === 'right' ? 'flex-end' : 'center';
  return (
    <View pointerEvents="none" style={[s.bubbleRow, { alignItems: align }]}>
      <View style={s.bubble}>
        <AppText size="caption" color={c.actionFg} numberOfLines={full ? undefined : 2}>
          {text}
        </AppText>
      </View>
      <View style={[s.tail, side === 'left' ? s.tailLeft : side === 'right' ? s.tailRight : null]}>
        <View style={[s.tri, triangle(side, TAIL, c.bg)]} />
        <View style={[s.tri, s.triInner, side === 'right' ? { right: BUBBLE_LINE } : { left: BUBBLE_LINE }, triangle(side, TAIL - BUBBLE_LINE * 2, c.action)]} />
      </View>
    </View>
  );
}

/** 아래를 향한 삼각형. 옆에 선 사람을 가리킬 때는 그쪽 변을 세워 비스듬히 뺀다 */
function triangle(side: BubbleSide, size: number, color: string) {
  return {
    borderTopWidth: size,
    borderTopColor: color,
    borderLeftWidth: side === 'left' ? 0 : size * TAIL_SPREAD,
    borderRightWidth: side === 'right' ? 0 : size * TAIL_SPREAD,
  };
}

const TAIL = sp[4];
/** 꼬리 밑변의 반폭 비율. 0.5면 가늘어 폰 크기 컷에서 꼬리로 읽히지 않았다 */
const TAIL_SPREAD = 0.7;
const BUBBLE_LINE = 1.5;

const s = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP },
  panel: { overflow: 'hidden', borderRadius: r.control, backgroundColor: c.surface },
  abs: { position: 'absolute' },
  placeholder: { alignItems: 'center', justifyContent: 'center' },
  bubbleRow: { position: 'absolute', top: sp[2], left: sp[2], right: sp[2] },
  bubble: {
    maxWidth: '85%',
    paddingHorizontal: sp[3],
    paddingVertical: sp[1],
    borderRadius: r.surface,
    borderWidth: BUBBLE_LINE,
    borderColor: c.bg,
    backgroundColor: c.action,
  },
  tail: { marginTop: -BUBBLE_LINE },
  tailLeft: { marginLeft: sp[4] },
  tailRight: { marginRight: sp[4] },
  tri: { width: 0, height: 0, borderLeftColor: 'transparent', borderRightColor: 'transparent' },
  triInner: { position: 'absolute', top: 0 },
  caption: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: sp[2],
    paddingVertical: sp[1],
    backgroundColor: c.scrim,
  },
});
