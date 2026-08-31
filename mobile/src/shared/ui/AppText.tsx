import { Text, type TextProps, type TextStyle } from 'react-native';

import { c, font, type, type Weight, type TypeScale } from '@theme/token';

type Props = TextProps & {
  size?: TypeScale;
  weight?: Weight;
  color?: string;
  /** 한 줄로 붙여야 할 때만 쓴다. 기본은 타이포 스케일의 행간을 따른다 */
  tight?: boolean;
};

/**
 * 앱의 모든 글자는 이걸로 그린다. RN의 <Text>를 직접 쓰지 않는다.
 *
 * Pretendard는 굵기별 파일이 따로 있어서 fontWeight로 굵기를 지정하면
 * Android가 가짜 볼드를 씌워 자소가 뭉개진다. fontFamily를 굵기로 매핑하고
 * fontWeight를 'normal'로 고정해야 네 굵기가 의도대로 나온다.
 * 이 컴포넌트를 거치는 이유가 그것이므로, 여기를 우회하면 규칙이 깨진다.
 */
export function AppText({ style, size = 'body', weight = 'regular', color = c.fg, tight, ...rest }: Props) {
  const scale = type[size];
  return (
    <Text
      {...rest}
      style={[
        {
          fontFamily: font[weight],
          fontWeight: 'normal',
          fontSize: scale.fontSize,
          lineHeight: tight ? undefined : scale.lineHeight,
          letterSpacing: scale.letterSpacing,
          color,
        } as TextStyle,
        style,
      ]}
    />
  );
}
