import type { Meta, StoryObj } from '@storybook/react-native';
import { useState } from 'react';
import { View } from 'react-native';

import { Badge, Button, Row, Stack } from '@components';
import { audioBackend, useRecorder } from '@shared/audio';
import { AppText } from '@shared/ui';
import { c, sp } from '@theme/token';

import { Waveform } from './Waveform';

const meta = { title: 'features/기록' } satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * **녹음이 실제로 되는지 여기서 판정한다.**
 *
 * 맨 위 뱃지가 `가짜`면 마이크를 안 쓰고 흉내만 내는 것이다.
 * 그 상태에서 "녹음이 되네"라고 판정하면 그 판정이 통째로 거짓이 된다.
 * `expo-audio` 네이티브가 들어간 빌드에서만 `expo-audio`가 뜬다.
 */
export const 녹음기: Story = {
  render: function Render() {
    const rec = useRecorder();
    const [err, setErr] = useState<string | null>(null);
    const [last, setLast] = useState<string | null>(null);

    const toggle = async () => {
      try {
        setErr(null);
        if (rec.isRecording) {
          const out = await rec.stop();
          setLast(`${(out.durationMs / 1000).toFixed(1)}초 · ${out.uri ?? '파일 없음'}`);
        } else {
          await rec.start();
        }
      } catch (e) {
        setErr(String(e));
      }
    };

    return (
      <Stack gap={sp[4]}>
        <Row>
          <AppText size="label" weight="semibold" style={{ flex: 1 }}>
            녹음 방식
          </AppText>
          {audioBackend() === 'expo-audio' ? (
            <Badge label="expo-audio" tone="neutral" />
          ) : (
            <Badge label="가짜 — 마이크 안 씀" tone="warning" />
          )}
        </Row>

        <View style={{ height: 64, justifyContent: 'center' }}>
          <Waveform level={rec.level} active={rec.isRecording} />
        </View>

        <Row>
          <AppText size="display" weight="bold" color={rec.isRecording ? c.running : c.fgFaint}>
            {String(Math.floor(rec.durationMs / 60000)).padStart(2, '0')}:
            {String(Math.floor(rec.durationMs / 1000) % 60).padStart(2, '0')}
          </AppText>
        </Row>

        <Button
          label={rec.isRecording ? '정지' : '녹음 시작'}
          variant={rec.isRecording ? 'secondary' : 'primary'}
          onPress={toggle}
          haptic
        />

        {!!last && (
          <AppText size="caption" color={c.fgFaint}>
            마지막 결과 — {last}
          </AppText>
        )}
        {!!err && (
          <AppText size="caption" color={c.danger}>
            {err}
          </AppText>
        )}

        <AppText size="caption" color={c.fgFaint}>
          파형이 흐르고, 멈추면 그 자리에 서야 한다
        </AppText>
      </Stack>
    );
  },
};
