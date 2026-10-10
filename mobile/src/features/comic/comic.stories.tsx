import type { Meta, StoryObj } from '@storybook/react-native';

import { Stack } from '@components';
import type { ComicPanel, ComicStatus } from '@shared/api/comic';
import { AppText } from '@shared/ui';
import { c, sp } from '@theme/token';

import { ComicSteps } from './ComicSteps';
import { ComicView } from './ComicView';

const meta = { title: 'features/꿈 만화' } satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const PANELS: ComicPanel[] = [
  { caption: '학교 옥상에 서 있었다. 아래가 까마득했다.', dialogue: '여기서 뛰면 어떻게 될까?' },
  { caption: '뛰어내렸는데 떨어지지 않았다.', dialogue: null },
  { caption: '바다 위를 한참 날았다. 물빛이 이상하게 보라색이었다.', dialogue: '집이 어디였더라' },
  { caption: '눈을 떠 보니 침대였다.', dialogue: null },
];

/**
 * CM-3 뷰어. 그림 자리는 가짜 서버처럼 비워 두고 **글자가 어떻게 얹히는지**를 본다 —
 * 해설은 아래 띠, 대사는 위 말풍선. 긴 해설은 칸에서 세 줄로 자르고, 누르면 크게 보며 다 보인다.
 */
export const 네컷: Story = {
  render: () => <ComicView layout="grid2x2" imageUrls={[]} panels={PANELS} onPressPanel={() => {}} />,
};

/** 서버가 해설 · 대사를 아직 안 줬을 때(그림 단계 전). 번호만 보인다 */
export const 글자없음: Story = {
  render: () => <ComicView layout={null} imageUrls={[]} panels={[]} />,
};

const STATUSES: ComicStatus[] = ['queued', 'scripting', 'drawing', 'done'];

/**
 * CM-2 진행. **청록은 지금 하는 단계 하나에만** 돈다(절대 규칙 5).
 * 실패 · 거절은 체크리스트 대신 문구로 보인다(화면 `app/comic/[id].tsx`)
 */
export const 진행단계: Story = {
  render: () => (
    <Stack gap={sp[8]}>
      {STATUSES.map((st) => (
        <Stack key={st} gap={sp[3]}>
          <AppText size="caption" color={c.fgFaint}>
            {st}
          </AppText>
          <ComicSteps status={st} />
        </Stack>
      ))}
    </Stack>
  ),
};
