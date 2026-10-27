import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View, type LayoutChangeEvent } from 'react-native';

import { Skeleton } from '@components';
import type { ComicLayout, ComicPanel } from '@shared/api/comic';
import { AppText } from '@shared/ui';
import { avatarBg, c, press, r, sp } from '@theme/token';

import { bubbleSide, gridCrop, imageKey, type BubbleSide } from './logic';

type Props = {
  layout: ComicLayout | null;
  imageUrls: string[];
  panels: ComicPanel[];
  /** 컷을 누르면 크게 본다. 없으면 누를 수 없다 */
  onPressPanel?: (index: number) => void;
  /**
   * 네 컷이 모두 그림을 받았거나(말풍선까지 얹힘) 받지 못해 걷어 냈을 때 한 번 부른다. 사진에 저장은 그 뒤에만 —
   * 받는 중에 찍으면 스켈레톤만 담긴다(이슈 #151 리뷰)
   */
  onReady?: () => void;
};

const GAP = sp[1];

/**
 * CM-3의 네 컷(계획서 003 — "4컷 그리드, 탭하면 전체화면 확대").
 *
 * **글자는 그림 위에 앱이 얹는다**(문서 081). 대사는 위쪽 말풍선에 — 말풍선은 말하는 사람 쪽으로 붙는다(`speaker`).
 * **해설은 그림 위에 얹지 않는다**(이슈 #115) — 짧게 줄인 해설이 오히려 꿈을 생략해 보였고, 만화는 늘
 * 꿈 본문과 함께 보인다. 해설은 화면 읽기(접근성 이름)에만 쓴다.
 * 그림이 없으면(가짜 서버 · 받는 중) 그 자리에 자리 그림을 그린다 — 글자는 그대로 읽힌다.
 */
export function ComicView({ layout, imageUrls, panels, onPressPanel, onReady }: Props) {
  const [width, setWidth] = useState(0);
  const [settled, setSettled] = useState<number[]>([]);
  const settle = (i: number) => setSettled((cur) => (cur.includes(i) ? cur : [...cur, i]));
  const ready = settled.length === 4;
  useEffect(() => {
    if (ready) onReady?.();
  }, [ready, onReady]);
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
            <ComicPanelView
              index={i}
              size={cell}
              layout={layout}
              imageUrls={imageUrls}
              panel={panels[i]}
              onSettled={() => settle(i)}
            />
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
  /** 크게 볼 때는 대사를 줄이지 않는다 */
  full?: boolean;
  /** 그림을 받았거나 못 받아 걷어 냈다(그림이 없는 컷은 바로) */
  onSettled?: () => void;
};

/** 컷 하나. 뷰어의 칸과 크게 보기가 함께 쓴다 */
export function ComicPanelView({ index, size, layout, imageUrls, panel, full, onSettled: notify }: PanelProps) {
  const source = layout === 'grid2x2' ? imageUrls[0] : layout === 'panels4' ? imageUrls[index] : undefined;
  /**
   * 그림을 받는 동안은 스켈레톤을 깐다(이슈 #129, 2026-10-26 사용자 — 꿈 나눔 글에서 검은 칸만 보였다).
   * 그림은 서버에서 받아 오므로 몇 초 걸릴 수 있다. 못 받아도(onError) 걷어 낸다 — 계속 깜빡이면 아직 오는 중으로 읽힌다.
   * 말풍선은 그림이 온 뒤에 얹는다. 빈 칸 위에 말풍선만 떠 있으면 컷이 아니라 글 상자로 읽힌다
   */
  /**
   * 「받았다」는 **그림 자체**에 붙인다 — 서명을 뺀 주소(`imageKey`)가 그 그림이다.
   * 서버는 응답할 때마다 새로 서명한 주소를 준다(S3 presign). 주소 문자열을 그대로 쓰면 다시 읽을 때마다
   * (댓글 하나만 달아도) 같은 그림이 지워지고 스켈레톤이 다시 돌았다(PR #130 독립 리뷰). 다른 그림으로 바뀔 때만 다시 기다린다.
   * 같은 키를 `cacheKey`로 줘서 서명만 바뀐 그림은 다시 받지 않고 캐시에서 꺼낸다
   */
  const key = source ? imageKey(source) : null;
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const waiting = !!key && loadedKey !== key;
  const onSettled = () => setLoadedKey(key);
  useEffect(() => {
    if (!waiting) notify?.();
  }, [waiting, notify]);
  const image = source && key ? { uri: source, cacheKey: key } : undefined;
  return (
    <View style={[s.panel, { width: size, height: size }]}>
      {waiting && (
        <View style={StyleSheet.absoluteFill}>
          <Skeleton width={size} height={size} radius={0} />
        </View>
      )}
      {source ? (
        layout === 'grid2x2' ? (
          <Image
            source={image}
            style={[s.abs, gridCrop(index, size)]}
            contentFit="cover"
            recyclingKey={key}
            onLoad={onSettled}
            onError={onSettled}
          />
        ) : (
          <Image
            source={image}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            recyclingKey={key}
            onLoad={onSettled}
            onError={onSettled}
          />
        )
      ) : (
        <View style={[StyleSheet.absoluteFill, s.placeholder, { backgroundColor: avatarBg[index % avatarBg.length] }]}>
          <AppText size="display" weight="bold" color={c.fgFaint}>
            {index + 1}
          </AppText>
        </View>
      )}
      {!!panel?.dialogue && !waiting && <SpeechBubble text={panel.dialogue} side={bubbleSide(panel.speaker)} full={full} />}
    </View>
  );
}

/**
 * 말풍선. 말하는 사람 쪽 위에 놓고 꼬리를 그쪽 아래로 뺀다(이슈 #106).
 * 꼬리는 테두리색 삼각형 위에 한 겹 작은 바탕색 삼각형을 겹쳐 테두리가 이어져 보이게 한다.
 * 안쪽 삼각형은 몸통 안으로 `TAIL_OVERLAP`만큼 올려 그린다 — 테두리와 딱 맞닿게 두면 기기 픽셀 반올림에 따라
 * 몸통 아래 테두리가 꼬리 입구에 한 줄 남았다(이슈 #115)
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
        <View style={[s.tri, s.triInner, innerPlace(side), triangle(side, innerSize(side), c.action)]} />
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
/** 안쪽 삼각형을 몸통 안으로 겹쳐 올리는 높이. 몸통 위아래 여백(`sp[1]`)보다 작아 글자를 덮지 않는다 */
const TAIL_OVERLAP = BUBBLE_LINE * 2;
/** 비스듬한 변을 테두리 두께만큼 안으로 밀 때의 가로 거리 */
const SLANT_INSET = BUBBLE_LINE * Math.sqrt(1 + TAIL_SPREAD * TAIL_SPREAD);

/**
 * 안쪽 삼각형의 높이. 바깥 삼각형과 변이 나란하고 테두리 두께만큼 안쪽에 있도록 꼭짓점을 올린 뒤,
 * 몸통 안으로 겹친 만큼 더한다. 옆을 가리키는 꼬리는 세운 변도 테두리 두께만큼 안으로 들어온다
 */
function innerSize(side: BubbleSide) {
  const inset = side === 'center' ? SLANT_INSET : SLANT_INSET + BUBBLE_LINE;
  return TAIL - inset / TAIL_SPREAD + TAIL_OVERLAP;
}

function innerPlace(side: BubbleSide) {
  const top = -TAIL_OVERLAP;
  if (side === 'left') return { top, left: BUBBLE_LINE };
  if (side === 'right') return { top, right: BUBBLE_LINE };
  return { top, left: TAIL_SPREAD * (TAIL - innerSize(side)) };
}

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
  triInner: { position: 'absolute' },
});
