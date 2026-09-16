import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';

import { Badge, Button, Card, Row, Screen, Stack, Title } from '@components';
import { audioBackend, mmss } from '@shared/audio';
import { getDreamRepo, storageBackend, type Dream } from '@shared/db';
import { updateInfo } from '@shared/updates';
import { API_BASE_URL, HAS_API, ping } from '@shared/api/client';
import { googleBackend, sessionBackend } from '@shared/auth';
import { AUTH_CONFIGURED } from '@shared/auth/google';
import { diagnoseSync, type SyncDiagnosis } from '@shared/sync';
import { AppText } from '@shared/ui';
import { c, sp } from '@theme/token';
import { ensureWidgetSnapshot, widgetBackend } from '@features/widget';

/** 기기에서 읽고 판정하기 쉽게 한 줄에 하나씩 */
function formatDiagnosis(d: SyncDiagnosis): string {
  const lines: string[] = [];
  if (d.report) {
    const r = d.report;
    lines.push(`올림 ${r.pushed} · 건너뜀 ${r.skipped} · 거절 ${r.rejected.length} · 받음 ${r.pulled}`);
    if (r.morePending) lines.push('올릴 것이 더 남았습니다 — 한 번 더 누르세요');
    for (const x of r.rejected) lines.push(`거절 ${x.id} · ${x.reason ?? '이유 없음'}`);
    if (r.error) lines.push(`동기화 오류 · ${r.error}`);
  }
  if (d.local) lines.push(`폰 기록 ${d.local.count}건 · 올릴 것 ${d.local.pending}건`);
  if (d.server) {
    const extra = [
      d.server.deleted > 0 ? `지운 것 ${d.server.deleted}건 따로` : null,
      d.server.truncated ? '2,000건에서 세기를 멈춤' : null,
    ].filter(Boolean);
    lines.push(`서버 기록 ${d.server.count}건${extra.length ? ` (${extra.join(' · ')})` : ''}`);
    lines.push(
      `서버의 가장 최근 수정 · ${d.server.latest ? (d.server.latest.title ?? '(제목 없음)') : '없음'}`,
    );
  }
  if (d.note) lines.push(d.note);
  return lines.join('\n');
}

/**
 * 빌드 진단 화면.
 *
 * **스토리북과 내용이 겹치지만 일부러 따로 만든다.** `preview` 프로필은
 * `EXPO_PUBLIC_STORYBOOK_ENABLED=false`로 스토리북을 통째로 끄기 때문에,
 * 정작 판정이 필요한 그 빌드에서 검수 스토리를 열 수 없다.
 *
 * 스토리북을 `preview`에서도 켜면 되지 않느냐면 — **번들이 2.4MB에서 7.1MB로 불어난다.**
 * 이 빌드로 재려는 것이 잠금화면 콜드 스타트라, 그 무게가 측정 대상을 오염시킨다.
 * 이 화면은 몇 KB다.
 */
export default function DiagScreen() {
  const router = useRouter();
  const [rows, setRows] = useState<Dream[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [storage, setStorage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const repo = await getDreamRepo();
    return { list: await repo.list({ limit: 10 }), storage: storageBackend() };
  }, []);

  // 상태를 effect 안에서 곧바로 바꾸지 않고 **약속이 끝난 뒤 콜백에서** 바꾼다.
  // 곧장 바꾸면 렌더가 연쇄로 돌고, 새 훅 규칙(react-hooks/set-state-in-effect)이 막는다
  const refresh = useCallback(() => {
    load()
      .then(({ list, storage }) => {
        setRows(list);
        setStorage(storage);
        setErr(null);
      })
      .catch((e) => setErr(String(e)));
  }, [load]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  /**
   * `duration_ms`에 값을 넣어 왕복시킨다. **마이그레이션 v2가 안 돌았으면
   * 여기서 `no such column: duration_ms`로 실패해 아래 빨간 줄에 그대로 뜬다.**
   */
  const probe = () => {
    void (async () => {
      setBusy(true);
      try {
        const repo = await getDreamRepo();
        await repo.create({
          text: '진단용 기록',
          audioPath: 'file:///진단용-가짜-경로.m4a',
          durationMs: 12_000,
        });
        refresh();
      } catch (e) {
        setErr(String(e));
      } finally {
        setBusy(false);
      }
    })();
  };

  const upd = updateInfo();
  const [pinged, setPinged] = useState<string | null>(null);
  const [synced, setSynced] = useState<string | null>(null);

  /** 서버에 닿는지만 따로 잰다. 로그인 흐름과 섞이면 어디서 끊겼는지 못 가린다 */
  const doPing = () => {
    setPinged('확인 중입니다');
    void ping().then(setPinged);
  };

  /** 동기화를 한 번 돌리고 서버를 따로 센다. 평소 동기화는 조용히 돌아 결과가 안 남는다 */
  const doSync = () => {
    setSynced('동기화 중입니다');
    void diagnoseSync()
      .then((d) => {
        setSynced(formatDiagnosis(d));
        refresh();
      })
      .catch((e) => setSynced(`실패 · ${String(e)}`));
  };

  return (
    <Screen scroll>
      <Title sub="preview 빌드에서 네이티브가 실제로 붙었는지 본다">빌드 진단</Title>

      <Stack gap={sp[3]}>
        <Row>
          <AppText size="label" style={{ flex: 1 }}>
            저장
          </AppText>
          {storage === 'sqlite' ? (
            <Badge label="SQLite" tone="neutral" />
          ) : (
            <Badge label="메모리 — 끄면 사라짐" tone="warning" />
          )}
        </Row>
        <Row>
          <AppText size="label" style={{ flex: 1 }}>
            녹음
          </AppText>
          {audioBackend() === 'expo-audio' ? (
            <Badge label="expo-audio" tone="neutral" />
          ) : (
            <Badge label="가짜 — 마이크 안 씀" tone="warning" />
          )}
        </Row>
        <Row>
          <AppText size="label" style={{ flex: 1 }}>
            위젯
          </AppText>
          {widgetBackend() === 'expo-widgets' ? (
            <Badge label="expo-widgets" tone="neutral" />
          ) : (
            <Badge label="없음 — 빌드에 안 들어감" tone="warning" />
          )}
        </Row>
        {/* 이 줄이 OTA 판정 그 자체다. 코드가 안 바뀐 업데이트는 화면이 똑같아서
            "새 번들이 왔다"와 "안 와서 옛 번들이 돈다"가 눈으로 구분되지 않는다 */}
        <Row>
          <AppText size="label" style={{ flex: 1 }}>
            번들
          </AppText>
          {upd == null ? (
            <Badge label="없음 — 빌드에 안 들어감" tone="warning" />
          ) : !upd.enabled ? (
            <Badge label="꺼짐 — 개발 빌드" tone="warning" />
          ) : upd.embedded ? (
            <Badge label="빌드에 박힌 것 — OTA 아직" tone="warning" />
          ) : (
            <Badge label="무선으로 받은 것" tone="running" />
          )}
        </Row>
        {/* 인증은 네이티브라 빌드를 한 번 먹는다. 그 빌드에서 무엇이 붙었는지
            여기서 바로 갈린다 — 로그인이 안 될 때 모듈 문제인지 설정 문제인지 */}
        <Row>
          <AppText size="label" style={{ flex: 1 }}>
            로그인
          </AppText>
          {googleBackend() !== 'google-signin' ? (
            <Badge label="없음 — 빌드에 안 들어감" tone="warning" />
          ) : !AUTH_CONFIGURED ? (
            <Badge label="클라이언트 ID 자리표시자" tone="warning" />
          ) : (
            <Badge label="google-signin" tone="neutral" />
          )}
        </Row>
        <Row>
          <AppText size="label" style={{ flex: 1 }}>
            세션
          </AppText>
          {sessionBackend() === 'secure-store' ? (
            <Badge label="secure-store" tone="neutral" />
          ) : (
            <Badge label="메모리 — 껐다 켜면 로그아웃" tone="warning" />
          )}
        </Row>
        <Row>
          <AppText size="label" style={{ flex: 1 }}>
            서버 주소
          </AppText>
          {HAS_API ? (
            <Badge label="설정됨" tone="neutral" />
          ) : (
            <Badge label="없음 — 동기화 불가" tone="warning" />
          )}
        </Row>
      </Stack>

      {upd != null && (
        <Card>
          <Stack gap={sp[2]}>
            <AppText size="caption" color={c.fgMuted}>
              채널 {upd.channel ?? '없음'}
            </AppText>
            <AppText size="caption" color={c.fgMuted}>
              런타임 {upd.runtimeVersion ?? '없음'}
            </AppText>
            <AppText size="caption" color={c.fgMuted}>
              업데이트 {upd.updateId ?? '없음 (빌드 원본)'}
            </AppText>
            <AppText size="caption" color={c.fgMuted}>
              받은 시각 {upd.createdAt ? upd.createdAt.toLocaleString('ko-KR') : '없음'}
            </AppText>
          </Stack>
        </Card>
      )}

      {!!err && (
        <Card>
          <AppText size="caption" color={c.danger}>
            {err}
          </AppText>
        </Card>
      )}

      <Stack gap={sp[2]}>
        <Button label="마이그레이션 v2 확인" size="sm" onPress={probe} disabled={busy} />
        <Button label="위젯 스냅샷 다시 그리기" size="sm" variant="secondary" onPress={ensureWidgetSnapshot} />
        <Button label="서버 연결 확인" size="sm" variant="secondary" onPress={doPing} />
        <Button label="동기화 확인" size="sm" variant="secondary" onPress={doSync} />
        <Button label="새로고침" size="sm" variant="ghost" onPress={refresh} />
      </Stack>

      {!!pinged && (
        <Card>
          <Stack gap={sp[2]}>
            <AppText size="caption" color={c.fgFaint}>
              {API_BASE_URL || '(주소 없음)'}
            </AppText>
            <AppText size="caption">{pinged}</AppText>
          </Stack>
        </Card>
      )}

      {!!synced && (
        <Card>
          <Stack gap={sp[2]}>
            <AppText size="caption" color={c.fgFaint}>
              동기화 확인
            </AppText>
            <AppText size="caption">{synced}</AppText>
          </Stack>
        </Card>
      )}

      <AppText size="caption" color={c.fgFaint}>
        기록 {rows.length}건 (최근 10건까지)
      </AppText>

      <Stack gap={sp[2]}>
        {rows.map((d) => (
          <Card key={d.id}>
            <AppText size="caption" numberOfLines={2}>
              {d.text ?? '(내용 없음)'}
            </AppText>
            <AppText size="caption" color={c.fgFaint}>
              {d.recordedAt.slice(0, 19).replace('T', ' ')}
              {d.audioPath ? ` · 오디오 ${mmss(d.durationMs)}` : ' · 오디오 없음'}
            </AppText>
          </Card>
        ))}
      </Stack>

      {rows.length === 0 && (
        <AppText size="caption" color={c.fgFaint}>
          비어 있다. 잠금화면 위젯으로 한 건 남긴 뒤 여기로 돌아와 새로고침한다.
          그때 남아 있으면 저장까지 한 줄이 이어진 것이다
        </AppText>
      )}

      <Button label="닫기" size="sm" variant="ghost" onPress={() => router.back()} />
    </Screen>
  );
}
