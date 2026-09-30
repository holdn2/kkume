import { useState } from 'react';
import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native';

import { AppText } from '@shared/ui';
import { c, font, hit, r, sp, type as ty } from '@theme/token';

import { Row, Spacer } from './layout';

type Props = TextInputProps & {
  /** 위에 붙는 작은 라벨. 폼에서는 거의 항상 준다 */
  label?: string;
  error?: string;
  /** `maxLength`와 같이 줬을 때만 글자수를 센다 */
  counter?: boolean;
  /**
   * 여러 줄 입력의 처음 높이(줄 수). 기본은 문단용 높이다. **`1`이면 한 줄 입력과 같은 높이에서
   * 가운데 맞춰 시작하고 치는 만큼 늘어난다** — 댓글처럼 대개 한 줄인 곳에서 빈 상자 위쪽에
   * 안내 문구가 붙어 보이던 것을 막는다(2026-09-30)
   */
  rows?: 1;
};

/**
 * `multiline`이 Textarea를 겸한다.
 *
 * 쉬는 상태에는 테두리가 없고 채움만 있다. 테두리는 **포커스와 에러에만** 생긴다 —
 * 그래야 어디에 커서가 있는지가 색이 아니라 형태로 읽힌다.
 *
 * RM-1(새벽 기록)에서는 `autoFocus`와 함께 쓰고 **저장 버튼을 두지 않는다** —
 * 이탈하면 자동 저장이다. 저장 버튼은 "저장할까 말까"라는 결정을 만들고,
 * 그건 절대 규칙 7번이 막으려는 바로 그것이다.
 */
export function Input({
  label,
  error,
  counter,
  multiline,
  rows,
  style,
  onFocus,
  onBlur,
  value,
  maxLength,
  ...rest
}: Props) {
  const [focused, setFocused] = useState(false);
  const showCounter = counter && !!maxLength;
  // 한계에 닿으면 숫자를 경고색으로 바꾼다. `maxLength`가 더 치는 것을 조용히 막기 때문에,
  // 표시가 없으면 사용자는 **키보드가 먹통이 된 것으로** 읽는다
  const atLimit = showCounter && (value?.length ?? 0) >= (maxLength ?? 0);

  return (
    <View style={{ gap: sp[2] }}>
      {!!label && (
        <AppText size="caption" color={c.fgMuted}>
          {label}
        </AppText>
      )}

      <TextInput
        {...rest}
        value={value}
        maxLength={maxLength}
        multiline={multiline}
        placeholderTextColor={c.fgDisabled}
        onFocus={(e) => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          onBlur?.(e);
        }}
        style={[
          s.base,
          multiline ? (rows === 1 ? s.growing : s.multiline) : s.single,
          focused && { borderColor: c.action },
          // 에러가 포커스를 이긴다. 고쳐야 할 것이 우선이다
          !!error && { borderColor: c.danger },
          style,
        ]}
      />

      {(!!error || showCounter) && (
        <Row>
          {!!error && (
            <AppText size="caption" color={c.danger}>
              {error}
            </AppText>
          )}
          <Spacer />
          {showCounter && (
            <AppText size="caption" color={atLimit ? c.danger : c.fgFaint}>
              {(value?.length ?? 0) + ' / ' + maxLength}
            </AppText>
          )}
        </Row>
      )}
    </View>
  );
}

const BORDER = 1.5;
/**
 * 본문 글자(Pretendard 16)가 스스로 차지하는 줄 높이. 글꼴 값이다 — hhea 위 1950 + 아래 494, 단위 2048
 * (`assets/fonts/Pretendard-Regular.otf`). 글꼴이나 본문 크기를 바꾸면 함께 바꾼다
 */
const FONT_LINE = (ty.body.fontSize * (1950 + 494)) / 2048;

const s = StyleSheet.create({
  base: {
    backgroundColor: c.surface,
    borderRadius: r.control,
    // 평소에도 테두리를 두되 투명하게 둔다. 포커스 때 레이아웃이 밀리지 않는다
    borderWidth: BORDER,
    borderColor: 'transparent',
    paddingHorizontal: sp[4],
    color: c.fg,
    fontFamily: font.regular,
    fontSize: ty.body.fontSize,
    letterSpacing: ty.body.letterSpacing,
  },
  /**
   * 한 줄 입력에는 `lineHeight`를 주지 않는다.
   * iOS의 TextInput은 lineHeight가 있으면 글자를 상자 아래쪽에 붙여 그린다.
   * 높이를 고정하고 세로 패딩을 0으로 두면 시스템이 알아서 가운데로 맞춘다.
   */
  single: { height: hit.base, paddingVertical: 0 },
  // 여러 줄에서는 반대로 lineHeight가 있어야 문단이 읽힌다
  multiline: {
    minHeight: 140,
    paddingVertical: sp[3],
    lineHeight: ty.body.lineHeight,
    textAlignVertical: 'top',
  },
  /**
   * 한 줄 높이에서 시작해 늘어나는 여러 줄. 여섯 줄쯤에서 멈추고 안쪽이 스크롤된다.
   *
   * **`lineHeight`를 주지 않는다.** RN 은 글자(Text)에는 줄 높이의 남는 공간을 위아래로 나누는 보정
   * (`RCTApplyBaselineOffset`)을 하지만 입력칸에는 하지 않아서, iOS 가 남는 공간(26 - 19.1)을 전부 글자 위에
   * 넣어 **글자와 안내 문구가 약 3.5pt 아래로 쏠렸다**(2026-09-30 기기 확인, RN 0.86 `RCTAttributedTextUtils.mm`).
   * 대신 글꼴 자체의 줄 높이로 위아래 패딩을 나눠 한 줄일 때 한가운데 온다
   */
  growing: {
    minHeight: hit.base,
    maxHeight: hit.base + FONT_LINE * 5,
    paddingVertical: (hit.base - BORDER * 2 - FONT_LINE) / 2,
    textAlignVertical: 'top',
  },
});
