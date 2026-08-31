import type { Meta, StoryObj } from '@storybook/react-native';
import { View } from 'react-native';

import { AppText } from '@shared/ui/AppText';
import { avatarBg, c, r, sp } from '@theme/token';

// 온디바이스 스토리북에는 배경 전환 UI가 없다(웹 애드온이다).
// 그래서 배경 단계는 눈으로 직접 겹쳐 보여준다 — 앱에서 실제로 쌓이는 순서 그대로.
const meta = {
  title: 'theme/토큰',
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * 진짜 질문은 "각 색이 무엇인가"가 아니라
 * **겹쳤을 때 경계가 보이는가**다. 반투명을 걷어내고 불투명 회색 단계로 바꾼 뒤
 * 최소 밝기에서 이 네 겹이 서로 구분되는지가 판정 대상이다.
 */
export const 배경단계: Story = {
  render: () => (
    <View style={{ gap: sp[4] }}>
      <View style={{ backgroundColor: c.bg, padding: sp[4], borderRadius: r.surface, gap: sp[2] }}>
        <AppText size="caption" color={c.fgMuted}>
          bg · 모든 탭 화면
        </AppText>
        <View
          style={{ backgroundColor: c.surface, padding: sp[4], borderRadius: r.surface, gap: sp[2] }}>
          <AppText size="caption" color={c.fgMuted}>
            surface · 카드 · 입력 · 시트
          </AppText>
          <View style={{ backgroundColor: c.raised, padding: sp[3], borderRadius: r.control }}>
            <AppText size="caption" color={c.fgMuted}>
              raised · surface 위에 올라가는 것
            </AppText>
          </View>
        </View>
      </View>

      <View style={{ height: 1, backgroundColor: c.line }} />
      <AppText size="caption" color={c.fgFaint}>
        위 선이 line이다. 목록 구분선으로는 쓰지 않는다 — 정말 필요한 경계에만
      </AppText>

      <View style={{ backgroundColor: c.night, padding: sp[5], borderRadius: r.surface, gap: sp[1] }}>
        <AppText size="caption" color={c.fgMuted}>
          night · RM-1 전용 · 순수 검정
        </AppText>
        <AppText color={c.fgMuted}>OLED에서 픽셀이 꺼진다. 새벽에 가장 눈이 편한 배경이다</AppText>
      </View>
    </View>
  ),
};

/** 최소 밝기에서 fgFaint가 읽히고 fgDisabled가 확실히 꺼져 보여야 한다. */
export const 전경단계: Story = {
  render: () => (
    <View style={{ gap: sp[3] }}>
      <AppText color={c.fg}>fg · 본문 — 18.8:1</AppText>
      <AppText color={c.fgMuted}>fgMuted · 보조 — 7.04:1</AppText>
      <AppText color={c.fgFaint}>fgFaint · 메타 — 3.73:1</AppText>
      <AppText color={c.fgDisabled}>fgDisabled · 비활성 — 2.10:1</AppText>
      <View style={{ height: sp[2] }} />
      <AppText size="caption" color={c.fgFaint}>
        fgFaint와 fgDisabled는 서로 1.77:1이다. 이보다 좁으면 둘이 같아 보인다
      </AppText>
    </View>
  ),
};

/**
 * **UI는 무채색이고, 색이 보이면 그것은 상태다.**
 * 그래서 주 버튼도 보라가 아니라 흰색이다 — 이 화면에서 유채색은 아래 셋뿐이어야 한다.
 */
export const 역할색: Story = {
  render: () => (
    <View style={{ gap: sp[3] }}>
      <View style={{ backgroundColor: c.action, padding: sp[4], borderRadius: r.control }}>
        <AppText weight="semibold" color={c.actionFg} style={{ textAlign: 'center' }}>
          action + actionFg · 주요 액션
        </AppText>
      </View>

      {(
        [
          ['running', c.running, c.runningBg, '진행 중 — 녹음 · 생성 · 미확인'],
          ['warning', c.warning, c.warningBg, '동기화 대기 · 오프라인'],
          ['danger', c.danger, c.dangerBg, '삭제 · 신고 · 실패'],
        ] as const
      ).map(([name, fg, bg, use]) => (
        <View key={name} style={{ backgroundColor: bg, padding: sp[3], borderRadius: r.control }}>
          <AppText weight="semibold" color={fg}>
            {name}
          </AppText>
          <AppText size="caption" color={fg}>
            {use}
          </AppText>
        </View>
      ))}

      <View style={{ height: sp[2] }} />
      <AppText size="caption" color={c.fgFaint}>
        상태 배경은 불투명하다. 반투명 10~13%는 최소 밝기에서 배경과 구분되지 않았다
      </AppText>
    </View>
  ),
};

/** UI가 무채색이라, 색이 사람을 구분하는 유일한 자리가 아바타다. */
export const 아바타색: Story = {
  render: () => (
    <View style={{ gap: sp[3] }}>
      <View style={{ flexDirection: 'row', gap: sp[2] }}>
        {avatarBg.map((bg) => (
          <View
            key={bg}
            style={{ width: 44, height: 44, borderRadius: r.chip, backgroundColor: bg }}
          />
        ))}
      </View>
      <AppText size="caption" color={c.fgFaint}>
        다섯 색이 최소 밝기에서 서로 구분돼야 한다
      </AppText>
    </View>
  ),
};

/** 반경은 크기가 아니라 역할로 고른다. 알약은 작은 것에만 쓴다. */
export const 반경: Story = {
  render: () => (
    <View style={{ gap: sp[3] }}>
      {(
        [
          ['chip · 뱃지 · 태그 · 세그먼트', r.chip, 36],
          ['control · 버튼 · 입력', r.control, 56],
          ['surface · 카드', r.surface, 72],
          ['sheet · 바텀시트 상단', r.sheet, 72],
        ] as const
      ).map(([name, radius, h]) => (
        <View
          key={name}
          style={{
            height: h,
            backgroundColor: c.surface,
            borderRadius: radius,
            justifyContent: 'center',
            paddingHorizontal: sp[4],
          }}>
          <AppText size="caption" color={c.fgMuted}>
            {name}
          </AppText>
        </View>
      ))}
      <AppText size="caption" color={c.fgFaint}>
        큰 버튼을 알약으로 만들면 그 순간 흔한 화면이 된다
      </AppText>
    </View>
  ),
};
