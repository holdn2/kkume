import type { Meta, StoryObj } from '@storybook/react-native';
import { View } from 'react-native';

import { AppText } from '@shared/ui/AppText';
import { c, r, sp } from '@theme/token';

// 온디바이스 스토리북에는 배경 전환 UI가 없다(웹 애드온이다).
// 그래서 배경 단계는 눈으로 직접 겹쳐 보여준다 — 앱에서 실제로 쌓이는 순서 그대로.
const meta = {
  title: 'theme/토큰',
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * 진짜 질문은 "각 색이 무엇인가"가 아니라
 * **겹쳤을 때 경계가 보이는가**다. 안 보이면 카드가 배경에 묻힌다.
 */
export const 배경단계: Story = {
  render: () => (
    <View style={{ gap: sp[4] }}>
      <View style={{ backgroundColor: c.bg, padding: sp[4], borderRadius: r.lg, gap: sp[2] }}>
        <AppText size="caption" color={c.fgMuted}>
          bg · 모든 탭 화면
        </AppText>
        <View style={{ backgroundColor: c.surface, padding: sp[4], borderRadius: r.md, gap: sp[2] }}>
          <AppText size="caption" color={c.fgMuted}>
            surface · 시트 · 보조 카드
          </AppText>
          <View style={{ backgroundColor: c.card, padding: sp[4], borderRadius: r.md, gap: sp[2] }}>
            <AppText size="caption" color={c.fgMuted}>
              card · 꿈 카드 · 게시글
            </AppText>
            <View style={{ backgroundColor: c.field, padding: sp[3], borderRadius: r.sm }}>
              <AppText size="caption" color={c.fgMuted}>
                field · 입력창
              </AppText>
            </View>
          </View>
        </View>
      </View>

      <View style={{ height: 1, backgroundColor: c.line }} />
      <AppText size="caption" color={c.fgFaint}>
        위 선이 line · 경계선이다
      </AppText>

      <View style={{ backgroundColor: c.night, padding: sp[5], borderRadius: r.lg, gap: sp[1] }}>
        <AppText size="caption" color={c.fgMuted}>
          night · RM-1 전용
        </AppText>
        <AppText color={c.fgMuted}>
          새벽 기록 화면에서만 쓴다. bg보다 한 단계 더 어둡다
        </AppText>
      </View>
    </View>
  ),
};

/** 최소 밝기에서 fgFaint가 읽히고 fgDisabled가 확실히 꺼져 보여야 한다. */
export const 전경단계: Story = {
  render: () => (
    <View style={{ gap: sp[3] }}>
      <AppText color={c.fg}>fg · 본문 — 15.72:1</AppText>
      <AppText color={c.fgMuted}>fgMuted · 보조 — 8.13:1</AppText>
      <AppText color={c.fgFaint}>fgFaint · 메타 — 4.83:1</AppText>
      <AppText color={c.fgDisabled}>fgDisabled · 비활성 — 2.55:1</AppText>
      <View style={{ height: sp[2] }} />
      <AppText size="caption" color={c.fgFaint}>
        fgFaint와 fgDisabled는 서로 1.89:1이다. 이보다 좁으면 둘이 같아 보인다
      </AppText>
    </View>
  ),
};

/** 역할색은 "어디에 쓰는가"가 정해져 있다. 그 밖에 쓰면 새벽에 상태를 색으로 못 읽는다. */
export const 역할색: Story = {
  render: () => (
    <View style={{ gap: sp[3] }}>
      <View style={{ backgroundColor: c.action, padding: sp[4], borderRadius: r.full }}>
        <AppText weight="semibold" color={c.actionFg} style={{ textAlign: 'center' }}>
          action + actionFg · 주요 액션
        </AppText>
      </View>
      <View style={{ backgroundColor: c.running, padding: sp[4], borderRadius: r.full }}>
        <AppText weight="semibold" color={c.runningFg} style={{ textAlign: 'center' }}>
          running + runningFg · 진행 중에만
        </AppText>
      </View>
      <AppText color={c.warning}>warning · 오프라인 · 동기화 대기</AppText>
      <AppText color={c.danger}>danger · 삭제 · 신고</AppText>
      <View style={{ height: sp[2] }} />
      <AppText size="caption" color={c.fgFaint}>
        action 위 라벨은 흰색이 아니다. 흰색은 3.33:1로 AA 미달이라 어둡게 잡았다 (5.91:1)
      </AppText>
    </View>
  ),
};
