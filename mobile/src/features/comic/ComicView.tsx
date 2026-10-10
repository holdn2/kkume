import { Image } from 'expo-image';
import { useState } from 'react';
import { Pressable, StyleSheet, View, type LayoutChangeEvent } from 'react-native';

import type { ComicLayout, ComicPanel } from '@shared/api/comic';
import { AppText } from '@shared/ui';
import { avatarBg, c, press, r, sp } from '@theme/token';

import { gridCrop } from './logic';

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
 * **글자는 그림 위에 앱이 얹는다**(문서 081). 해설은 컷 아래쪽 띠에, 대사는 위쪽 말풍선에.
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
      {!!panel?.dialogue && (
        <View style={s.bubble}>
          <AppText size="caption" color={c.actionFg} numberOfLines={full ? undefined : 2}>
            {panel.dialogue}
          </AppText>
        </View>
      )}
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

const s = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP },
  panel: { overflow: 'hidden', borderRadius: r.control, backgroundColor: c.surface },
  abs: { position: 'absolute' },
  placeholder: { alignItems: 'center', justifyContent: 'center' },
  bubble: {
    position: 'absolute',
    top: sp[2],
    left: sp[2],
    maxWidth: '80%',
    paddingHorizontal: sp[2],
    paddingVertical: sp[1],
    borderRadius: r.control,
    backgroundColor: c.action,
  },
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
