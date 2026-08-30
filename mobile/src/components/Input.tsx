import { useState } from 'react';
import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native';

import { AppText } from '@shared/ui/AppText';
import { c, font, hit, r, sp, type as ty } from '@theme/token';

type Props = TextInputProps & { error?: string };

/**
 * `multiline`이 Textarea를 겸한다.
 *
 * RM-1(새벽 기록)에서는 `autoFocus`와 함께 쓰고 **저장 버튼을 두지 않는다** —
 * 이탈하면 자동 저장이다. 저장 버튼은 "저장할까 말까"라는 결정을 만들고,
 * 그건 절대 규칙 7번이 막으려는 바로 그것이다.
 */
export function Input({ error, multiline, style, onFocus, onBlur, ...rest }: Props) {
  const [focused, setFocused] = useState(false);

  return (
    <View style={{ gap: sp[1] }}>
      <TextInput
        {...rest}
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
          multiline && s.multiline,
          focused && { borderColor: c.action },
          // 에러가 포커스를 이긴다. 고쳐야 할 것이 우선이다
          !!error && { borderColor: c.danger },
          style,
        ]}
      />
      {!!error && (
        <AppText size="caption" color={c.danger}>
          {error}
        </AppText>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  base: {
    minHeight: hit.min,
    backgroundColor: c.field,
    borderWidth: 1,
    // 평소에도 테두리를 두되 투명하게 둔다. 포커스 때 레이아웃이 밀리지 않는다
    borderColor: 'transparent',
    borderRadius: r.md,
    paddingHorizontal: sp[4],
    paddingVertical: sp[3],
    color: c.fg,
    fontFamily: font.regular,
    ...ty.body,
  },
  multiline: { minHeight: 120, textAlignVertical: 'top' },
});
