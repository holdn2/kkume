import type { Meta, StoryObj } from '@storybook/react-native';
import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';

import { Badge, Button, Card, Row, Stack } from '@components';
import { mmss } from '@shared/audio';
import { AppText } from '@shared/ui';
import { c, sp } from '@theme/token';

import { getDreamRepo, storageBackend, syncStateOf, type Dream } from './index';

const meta = { title: 'shared/저장소' } satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const SAMPLES = [
  '바다 위를 걷고 있었다. 발이 안 젖었고 파도 소리만 계속 들렸다',
  '이빨이 하나씩 빠지는데 아프지는 않았다',
  '끝이 안 보이는 복도를 계속 걸었다',
  '놀이터 그네 줄이 계속 길어져서 구름까지 올라갔다',
];

/**
 * **저장이 실제로 되는지 여기서 판정한다.**
 *
 * 맨 위에 지금 무엇으로 저장하고 있는지가 뜬다. `메모리`라고 떠 있으면
 * 앱을 껐다 켜는 순간 전부 사라지므로, 그 상태에서 "저장이 되네"라고 판정하면
 * 그 판정이 통째로 거짓이 된다. `expo-sqlite`가 들어간 빌드에서만 `SQLite`가 뜬다.
 *
 * **`녹음 기록`은 마이그레이션 v2를 판정한다.** `duration_ms`는 v2에서 더한 컬럼이라,
 * 마이그레이션이 안 돌았으면 그 버튼이 `no such column: duration_ms`로 실패하고
 * 아래 빨간 줄에 그대로 뜬다. 성공하면 행에 길이가 보인다.
 * v2 이전에 저장된 기록은 길이를 되찾을 수 없어 `--:--`로 남는 것이 정상이다.
 */
export const 저장소점검: Story = {
  render: function Render() {
    const [rows, setRows] = useState<Dream[]>([]);
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState<string | null>(null);
    const [backend, setBackend] = useState<string | null>(null);

    const refresh = useCallback(async () => {
      try {
        const repo = await getDreamRepo();
        setRows(await repo.list({ limit: 20 }));
        setBackend(storageBackend());
        setErr(null);
      } catch (e) {
        setErr(String(e));
      }
    }, []);

    useEffect(() => {
      void refresh();
    }, [refresh]);

    const run = useCallback(
      async (fn: () => Promise<unknown>) => {
        setBusy(true);
        try {
          await fn();
          await refresh();
        } catch (e) {
          setErr(String(e));
        } finally {
          setBusy(false);
        }
      },
      [refresh],
    );

    const sample = () => SAMPLES[Math.floor(Math.random() * SAMPLES.length)];

    const add = () =>
      run(async () => {
        const repo = await getDreamRepo();
        await repo.create({ text: sample() });
      });

    const addVoice = () =>
      run(async () => {
        const repo = await getDreamRepo();
        await repo.create({
          text: sample(),
          audioPath: 'file:///검수용-가짜-경로.m4a',
          durationMs: 12_000 + Math.floor(Math.random() * 108_000),
        });
      });

    const touch = (d: Dream) =>
      run(async () => {
        const repo = await getDreamRepo();
        await repo.update(d.id, { text: (d.text ?? '') + ' (고침)' });
      });

    const remove = (d: Dream) =>
      run(async () => {
        const repo = await getDreamRepo();
        await repo.softDelete(d.id);
      });

    const wipe = () =>
      run(async () => {
        const repo = await getDreamRepo();
        await repo.clear();
      });

    return (
      <Stack gap={sp[4]}>
        <Row>
          <AppText size="label" weight="semibold" style={{ flex: 1 }}>
            저장 방식
          </AppText>
          {backend === 'sqlite' ? (
            <Badge label="SQLite" tone="neutral" />
          ) : (
            <Badge label="메모리 — 끄면 사라짐" tone="warning" />
          )}
        </Row>

        {!!err && (
          <Card>
            <AppText size="caption" color={c.danger}>
              {err}
            </AppText>
          </Card>
        )}

        <Row gap={sp[2]}>
          <View style={{ flex: 1 }}>
            <Button label="글 기록" size="sm" onPress={add} disabled={busy} />
          </View>
          <View style={{ flex: 1 }}>
            <Button label="녹음 기록" size="sm" onPress={addVoice} disabled={busy} />
          </View>
          <View style={{ flex: 1 }}>
            <Button label="전부 지우기" size="sm" variant="danger" onPress={wipe} disabled={busy} />
          </View>
        </Row>

        <AppText size="caption" color={c.fgFaint}>
          {rows.length}건 · 행을 누르면 고쳐지고, 지우기는 soft delete라 목록에서만 빠진다
        </AppText>

        <Stack gap={sp[3]}>
          {rows.map((d) => (
            <Card key={d.id} onPress={() => touch(d)}>
              <Row>
                <AppText size="label" style={{ flex: 1 }} numberOfLines={2}>
                  {d.text ?? '(내용 없음)'}
                </AppText>
                <Badge
                  label={syncStateOf(d) === 'synced' ? '저장됨' : '동기화 대기'}
                  tone={syncStateOf(d) === 'synced' ? 'neutral' : 'warning'}
                />
              </Row>
              <Row>
                <AppText size="caption" color={c.fgFaint} style={{ flex: 1 }}>
                  {d.recordedAt.slice(0, 19).replace('T', ' ')}
                  {d.audioPath ? ` · ${mmss(d.durationMs)}` : ''}
                </AppText>
                <Button label="지우기" size="sm" variant="ghost" onPress={() => remove(d)} />
              </Row>
            </Card>
          ))}
        </Stack>

        {rows.length === 0 && (
          <AppText size="caption" color={c.fgFaint}>
            비어 있다. 기록을 추가한 뒤 **앱을 껐다 켜서** 남아 있는지 보는 것이 진짜 판정이다
          </AppText>
        )}
      </Stack>
    );
  },
};
