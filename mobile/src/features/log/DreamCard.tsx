import { Card, Badge, Row, Stack } from '@components';
import { mmss } from '@shared/audio';
import type { Dream } from '@shared/db';
import { AppText } from '@shared/ui';
import { c, sp } from '@theme/token';

/**
 * 기록 하나가 목록에서 갖는 얼굴.
 *
 * **제목이 없는 것이 기본값이다.** 새벽에는 제목을 묻지 않으므로(절대 규칙 7)
 * 갓 남긴 기록에는 제목이 없다. 그래서 제목 자리에 본문 첫 줄을 대신 놓는다 —
 * 비워 두면 목록이 "제목 없음"으로 가득 찬다.
 */
export function DreamCard({ dream, onPress }: { dream: Dream; onPress?: () => void }) {
  const unread = dream.reviewedAt == null;

  return (
    <Card onPress={onPress}>
      <Stack gap={sp[2]}>
        <Row gap={sp[2]}>
          <AppText size="label" weight="semibold" style={{ flex: 1 }} numberOfLines={2}>
            {headline(dream)}
          </AppText>
          {/* 청록은 "진행 중"에만 쓴다(절대 규칙 5). 아직 확인하지 않은 기록이 여기 해당한다 */}
          {unread && <Badge label="미확인" tone="running" />}
        </Row>

        <Row gap={sp[2]}>
          <AppText size="caption" color={c.fgFaint} style={{ flex: 1 }}>
            {when(dream.recordedAt)}
            {/* 경로는 있는데 길이가 없으면 **끝나지 않은 녹음**이다 —
                녹음 중에 앱이 죽었다. 파일은 남아 있으니 들을 수는 있다.
                `--:--`로 두면 "길이만 모르는 멀쩡한 기록"으로 읽혀서 따로 말한다 */}
            {dream.audioPath
              ? dream.durationMs == null
                ? ' · 끝나지 않은 녹음'
                : ` · ${mmss(dream.durationMs)}`
              : ''}
          </AppText>
        </Row>
      </Stack>
    </Card>
  );
}

/** 제목 → 본문 첫 줄 → 매체 이름 순으로 물러선다 */
function headline(d: Dream) {
  if (d.title?.trim()) return d.title.trim();
  const first = d.text?.trim().split('\n')[0];
  if (first) return first;
  return d.audioPath ? '음성으로 남긴 기록' : '내용 없음';
}

/**
 * 새벽 기록이라 **날짜보다 "언제쯤"이 먼저 읽혀야 한다.**
 * 어젯밤 것인지 지난주 것인지가 목록에서 가장 먼저 필요한 정보다.
 */
function when(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';

  const midnight = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((midnight(new Date()) - midnight(d)) / 86_400_000);
  const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

  if (days === 0) return `오늘 ${hm}`;
  if (days === 1) return `어제 ${hm}`;
  if (days < 7) return `${days}일 전 ${hm}`;
  return `${d.getMonth() + 1}월 ${d.getDate()}일 ${hm}`;
}
