import { Image } from 'expo-image';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { Skeleton } from '@components';
import type { ComicLayout, ComicPanel } from '@shared/api/comic';
import { AppText } from '@shared/ui';
import { avatarBg, c, press, r, sp } from '@theme/token';

import { BUBBLE_LINE, bubbleSide, bubbleSize, gridCrop, imageKey, TEXT_SHARE, type BubbleSide } from './logic';

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
 * **글자는 그림 위에 앱이 얹는다**(문서 081). 대사는 위쪽 말풍선에 — 말풍선은 위쪽 모서리에 붙는다(`speaker` 쪽, 모르면 번갈아).
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
  // 대사가 있으면 말풍선까지 그려진 뒤에 알린다 — 말풍선은 글자를 잰 다음 프레임에 그려져서,
  // 그림만 보고 알리면 그 사이에 누른 사진에 저장에 대사가 빠졌다(PR #162 리뷰)
  const talks = !!panel?.dialogue;
  const [drawn, setDrawn] = useState(false);
  const onDrawn = useCallback(() => setDrawn(true), []);
  useEffect(() => {
    if (!waiting && (!talks || drawn)) notify?.();
  }, [waiting, talks, drawn, notify]);
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
      {!!panel?.dialogue && !waiting && (
        <SpeechBubble
          text={panel.dialogue}
          side={bubbleSide(panel.speaker, index)}
          room={size - 2 * sp[2]}
          full={full}
          onDrawn={onDrawn}
        />
      )}
    </View>
  );
}

/**
 * 말풍선. 컷 위쪽 모서리에 놓고 꼬리를 그림 가운데 쪽 아래로 뺀다(이슈 #106 · #161).
 * 만화 말풍선처럼 흰 타원 + 검은 선이다 — 둥근 사각형은 만화가 아니라 앱 칩처럼 보였다(문서 103 B4).
 * 몸통과 꼬리를 **한 길**로 그려 선이 이어진다. 둘을 따로 그리면 꼬리 입구에 몸통 선이 남는다(이슈 #115에서 겪음).
 *
 * 타원은 **글자 상자를 품도록** 글자를 잰 뒤 정한다(`bubbleSize`). 상자에 여백만 두르고 그 안에 타원을 그리면
 * 넓은 윗줄 · 아랫줄의 끝 글자가 타원 밖으로 나갔다(PR #162 리뷰). 재기 전에는 글자를 숨긴다 — 바탕 없는 글자가 깜빡이지 않게.
 * 글자 폭은 픽셀로 묶는다(`room`) — 퍼센트로 두면 타원에 맞춰 늘린 여백이 다시 글자 폭을 바꾼다
 */
function SpeechBubble({
  text,
  side,
  room,
  full,
  onDrawn,
}: {
  text: string;
  side: BubbleSide;
  /** 말풍선이 차지할 수 있는 가로 폭 */
  room: number;
  full?: boolean;
  /** 타원까지 그려졌다 */
  onDrawn?: () => void;
}) {
  const [txt, setTxt] = useState<{ w: number; h: number } | null>(null);
  const onLayout = (e: LayoutChangeEvent) => {
    const { width: w, height: h } = e.nativeEvent.layout;
    setTxt((cur) => (cur && cur.w === w && cur.h === h ? cur : { w, h }));
  };
  const box = txt ? bubbleSize(txt.w, txt.h) : null;
  useEffect(() => {
    if (txt) onDrawn?.();
  }, [txt, onDrawn]);
  return (
    <View pointerEvents="none" style={[s.bubbleRow, { alignItems: side === 'left' ? 'flex-start' : 'flex-end' }]}>
      <View
        style={[
          box && txt
            ? { paddingHorizontal: (box.w - txt.w) / 2, paddingVertical: (box.h - txt.h) / 2 }
            : { opacity: 0 },
        ]}>
        {box && (
          <Svg width={box.w} height={box.h + TAIL} style={s.shape}>
            <Path
              d={bubblePath(box.w, box.h, side)}
              fill={c.action}
              stroke={c.bg}
              strokeWidth={BUBBLE_LINE}
              strokeLinejoin="round"
            />
          </Svg>
        )}
        <AppText
          onLayout={onLayout}
          size="caption"
          weight="semibold"
          color={c.actionFg}
          numberOfLines={full ? undefined : 2}
          // 낱말 중간에서 줄이 갈리지 않게(「어/떻게」) — 말풍선 대사는 짧아서 한 낱말이 갈리면 바로 보인다
          lineBreakStrategyIOS="hangul-word"
          style={[s.bubbleText, { maxWidth: room * TEXT_SHARE }]}>
          {text}
        </AppText>
      </View>
    </View>
  );
}

/** 꼬리가 몸통 아래로 나오는 길이 */
const TAIL = sp[3];
/** 꼬리 입구가 맨 아래에서 그림 가운데 쪽으로 돌아간 각도 · 입구 반폭(도) */
const TAIL_TURN = 22;
const TAIL_MOUTH = 8;
/**
 * 타원 + 꼬리를 한 길로. 꼬리 입구 두 점 사이를 뺀 나머지 타원을 크게 돌아(호) 꼬리 끝을 거쳐 닫는다.
 * 선이 상자 밖으로 잘리지 않게 반지름을 선 두께의 절반만큼 줄인다. 꼬리는 처음엔 아래로 나오다 가운데로 휜다
 */
function bubblePath(w: number, h: number, side: BubbleSide) {
  const half = BUBBLE_LINE / 2;
  const rx = w / 2 - half;
  const ry = h / 2 - half;
  const toward = side === 'left' ? 1 : -1;
  const at = (deg: number) => {
    const t = (deg * Math.PI) / 180;
    return { x: w / 2 + rx * Math.cos(t), y: h / 2 + ry * Math.sin(t) };
  };
  const mouth = 90 - toward * TAIL_TURN;
  const a = at(mouth + TAIL_MOUTH);
  const b = at(mouth - TAIL_MOUTH);
  const tip = { x: at(mouth).x + toward * TAIL * 0.9, y: h + TAIL - half };
  const bend = (p: { x: number; y: number }) => `${p.x + (tip.x - p.x) * 0.2} ${p.y + (tip.y - p.y) * 0.6}`;
  return [
    `M ${b.x} ${b.y}`,
    `A ${rx} ${ry} 0 1 0 ${a.x} ${a.y}`,
    `Q ${bend(a)} ${tip.x} ${tip.y}`,
    `Q ${bend(b)} ${b.x} ${b.y}`,
    'Z',
  ].join(' ');
}

const s = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP },
  panel: { overflow: 'hidden', borderRadius: r.control, backgroundColor: c.surface },
  abs: { position: 'absolute' },
  placeholder: { alignItems: 'center', justifyContent: 'center' },
  bubbleRow: { position: 'absolute', top: sp[2], left: sp[2], right: sp[2] },
  shape: { position: 'absolute', top: 0, left: 0 },
  bubbleText: { textAlign: 'center' },
});
