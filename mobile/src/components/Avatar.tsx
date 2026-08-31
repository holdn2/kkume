import { Image, StyleSheet, View, type ImageSourcePropType } from 'react-native';

import { AppText } from '@shared/ui/AppText';
import { avatarBg, r } from '@theme/token';

type Size = 'sm' | 'base' | 'lg';

const PX: Record<Size, number> = { sm: 32, base: 40, lg: 56 };

/**
 * 이름에서 색을 뽑는다. **같은 사람은 어느 화면에서나 같은 색이어야 한다** —
 * UI에서 색을 뺐기 때문에 색이 사람을 가리키는 유일한 신호가 됐고,
 * 화면마다 색이 달라지면 그 신호가 없는 것과 같아진다.
 */
function pickColor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i += 1) h = (h * 31 + name.charCodeAt(i)) % 100000;
  return avatarBg[h % avatarBg.length];
}

type Props = {
  /** 색과 첫 글자를 여기서 뽑는다. 사진이 없어도 빈 자리로 보이지 않게 하려는 것 */
  name: string;
  source?: ImageSourcePropType;
  size?: Size;
};

export function Avatar({ name, source, size = 'base' }: Props) {
  const px = PX[size];
  const shape = { width: px, height: px, borderRadius: r.chip };

  if (source) {
    return <Image source={source} style={shape} accessible accessibilityLabel={name} />;
  }

  return (
    <View style={[shape, s.fallback, { backgroundColor: pickColor(name) }]} accessibilityLabel={name}>
      <AppText size={size === 'sm' ? 'caption' : 'label'} weight="semibold">
        {name.trim().slice(0, 1).toUpperCase()}
      </AppText>
    </View>
  );
}

const s = StyleSheet.create({
  fallback: { alignItems: 'center', justifyContent: 'center' },
});
