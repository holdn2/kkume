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
  style,
  onFocus,
  onBlur,
  value,
  maxLength,
  ...rest
}: Props) {
  const [focused, setFocused] = useState(false);
  const showCounter = counter && !!maxLength;

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
          multiline ? s.multiline : s.single,
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
            <AppText size="caption" color={c.fgFaint}>
              {(value?.length ?? 0) + ' / ' + maxLength}
            </AppText>
          )}
        </Row>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  base: {
    backgroundColor: c.surface,
    borderRadius: r.control,
    // 평소에도 테두리를 두되 투명하게 둔다. 포커스 때 레이아웃이 밀리지 않는다
    borderWidth: 1.5,
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
});
