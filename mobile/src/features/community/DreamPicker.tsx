import { EmptyCard, Input, ListSkeleton, Radio } from '@components';
import { day } from '@shared/date';
import type { Dream } from '@shared/db';

/**
 * 꿈 공유하기의 「꿈 고르기」 부품(이슈 #129). 아직 고르지 않았을 때 **화면에 바로** 펼치는 목록과
 * 「다른 꿈 고르기」 시트가 같은 것을 쓴다 — 검색칸 · 한 줄 모양 · 빈 문구가 어긋나지 않게.
 * 검색칸은 둘 다 목록 바깥에 고정한다(목록만 스크롤된다).
 */

export function DreamSearch({ value, onChangeText }: { value: string; onChangeText: (v: string) => void }) {
  return (
    <Input
      value={value}
      onChangeText={onChangeText}
      placeholder="꿈 검색 — 제목이나 내용으로"
      returnKeyType="search"
      accessibilityLabel="꿈 검색"
      clearable
      bordered
    />
  );
}

export function DreamPickItem({ dream, selected, onPick }: { dream: Dream; selected: boolean; onPick: (d: Dream) => void }) {
  return (
    <Radio label={dreamTitle(dream)} description={day(dream.recordedAt)} selected={selected} onSelect={() => onPick(dream)} />
  );
}

/** 목록이 비었을 때. 아직 읽는 중이면 자리만 깐다 */
export function DreamPickEmpty({ rows, query }: { rows: Dream[] | null; query: string }) {
  if (rows === null) return <ListSkeleton count={2} />;
  if (rows.length > 0) return null;
  const q = query.trim();
  return q ? (
    <EmptyCard title={`「${q}」이(가) 든 꿈이 없습니다.`} hint="다른 말로 찾아보세요." />
  ) : (
    <EmptyCard title="아직 남긴 꿈이 없습니다." hint="꿈을 먼저 기록한 뒤 나눌 수 있습니다." />
  );
}

export function dreamTitle(d: Dream) {
  if (d.title?.trim()) return d.title.trim();
  const first = d.text?.trim().split('\n')[0];
  if (first) return first;
  return d.audioPath ? '음성으로 남긴 꿈' : '내용 없는 꿈';
}
