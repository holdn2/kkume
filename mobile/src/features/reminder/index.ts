import { requireOptionalNativeModule } from 'expo-modules-core';
import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { AppState, Linking, Platform } from 'react-native';

import { getDreamRepo, SETTINGS } from '@shared/db';

import { parseReminderTime, planReminder, type ReminderTime } from './logic';

export { REMINDER_TIMES, parseReminderTime, reminderLabel, type ReminderTime } from './logic';

/**
 * 낮 확인 알림(이슈 #145, 계획서 001 LOG-3 유도 · ON-4). 폰 안에서 예약하는 알림이라 서버가 없다.
 *
 * **알림으로 기록을 받지 않는다**(절대 규칙 8) — 이 알림은 누르면 꿈 로그를 여는 것이 전부다.
 *
 * 모듈은 있을 때만 부른다(절대 규칙 10). `expo-notifications`는 안쪽에서 `requireNativeModule`을 써서 없으면 던진다
 */
export const HAS_NOTIFICATIONS = requireOptionalNativeModule('ExpoNotificationScheduler') != null;

type N = typeof import('expo-notifications');
let mod: N | null = null;
function notifications(): N | null {
  if (!HAS_NOTIFICATIONS) return null;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  mod ??= require('expo-notifications') as N;
  return mod;
}

/** 예약 id. 늘 같은 값이라 다시 예약하면 제자리에서 바뀐다 — 두 개가 쌓이지 않는다 */
const REMINDER_ID = 'day-reminder';
/** Android 채널. 채널 설정은 만든 뒤에 못 바꾼다 — 바꾸려면 id에 버전을 붙여 새로 만든다(문서 022 03장) */
const CHANNEL_ID = 'day-reminder-v1';
/** 알림을 눌렀을 때 갈 곳 */
const TARGET = '/log';

export type Permission = 'granted' | 'ask' | 'denied' | 'unavailable';

type PermissionResponse = Awaited<ReturnType<N['getPermissionsAsync']>>;

/**
 * **한 번 거부했으면 `denied`다** — `canAskAgain`만 보지 않는다. Android는 거부한 뒤에도, 설정 앱에서 알림을 끈 뒤에도
 * `canAskAgain`이 참으로 남는데 그때 권한 창은 다시 뜨지 않는다(PR #146 리뷰). 그러면 「켜기」가 아무 일도 안 하는
 * 버튼이 된다. 거부했으면 설정 앱으로 보낸다
 */
function toPermission(N: N, p: PermissionResponse): Permission {
  if (p.granted || p.ios?.status === N.IosAuthorizationStatus.PROVISIONAL) return 'granted';
  return p.canAskAgain && p.status !== 'denied' ? 'ask' : 'denied';
}

export async function permission(): Promise<Permission> {
  const N = notifications();
  if (!N) return 'unavailable';
  return toPermission(N, await N.getPermissionsAsync());
}

/** 시스템 권한 창. 이미 거부했으면 창이 뜨지 않고 `denied`가 온다 — 그때는 설정 앱으로 보낸다 */
export async function askPermission(): Promise<Permission> {
  const N = notifications();
  if (!N) return 'unavailable';
  // Android 13+는 채널이 하나도 없으면 권한 창을 띄우지 않는다 — 묻기 전에 만든다(PR #146 리뷰)
  await ensureChannel(N);
  return toPermission(N, await N.requestPermissionsAsync({ ios: { allowAlert: true, allowSound: true, allowBadge: false } }));
}

/** Android 채널. 이미 있으면 그대로다(같은 id로 다시 만들어도 사용자가 바꾼 설정은 남는다) */
async function ensureChannel(N: N) {
  if (Platform.OS !== 'android') return;
  await N.setNotificationChannelAsync(CHANNEL_ID, { name: '낮 확인 알림', importance: N.AndroidImportance.DEFAULT });
}

export function openSystemSettings() {
  void Linking.openSettings().catch(() => {});
}

export async function readReminderTime(): Promise<ReminderTime | null> {
  const repo = await getDreamRepo();
  return parseReminderTime(await repo.getSetting(SETTINGS.dayReminder));
}

/** 시각을 바꾸고 예약을 맞춘다. 예약이 실패하면 앞의 값으로 되돌리고 던진다 — 화면이 「저장하지 못했어요」를 띄운다 */
export async function saveReminderTime(time: ReminderTime | null) {
  const repo = await getDreamRepo();
  const before = await repo.getSetting(SETTINGS.dayReminder);
  await repo.setSetting(SETTINGS.dayReminder, time ?? '');
  try {
    await syncReminder();
  } catch (e) {
    await repo.setSetting(SETTINGS.dayReminder, before ?? '').catch(() => {});
    void syncReminder().catch(() => {});
    throw e;
  }
}

/** 앞의 맞추기가 끝난 뒤에 맞춘다 — 늦게 끝난 옛 계산이 새 예약을 지우지 않게 */
let queue: Promise<unknown> = Promise.resolve();

/**
 * 예약을 지금 상태에 맞춘다. 꺼져 있거나 · 권한이 없거나 · 확인할 기록이 없으면 지운다.
 * **실패는 부른 쪽에 돌려준다** — 마이 탭에서 시각을 고른 경우 예약이 안 됐는데 켜진 것처럼 보이면 안 된다(PR #146 리뷰).
 * 줄은 실패해도 다음 맞추기로 이어진다. 앱이 뒤로 갈 때처럼 알아서 부르는 쪽은 실패를 버린다
 */
export function syncReminder(): Promise<void> {
  const run = async () => {
    const N = notifications();
    if (!N) return;
    const time = await readReminderTime();
    const unread = time ? (await (await getDreamRepo()).counts()).unread : 0;
    const plan = time && (await permission()) === 'granted' ? planReminder(new Date(), time, unread) : null;
    if (!plan) {
      await N.cancelScheduledNotificationAsync(REMINDER_ID);
      return;
    }
    await ensureChannel(N);
    await N.scheduleNotificationAsync({
      identifier: REMINDER_ID,
      content: { title: plan.title, body: plan.body, data: { to: TARGET } },
      trigger: { type: N.SchedulableTriggerInputTypes.DATE, date: plan.at, channelId: CHANNEL_ID },
    });
  };
  const next = queue.then(run);
  queue = next.catch(() => {});
  return next;
}

/**
 * 알림 시각에 앱을 보고 있어도 배너로 보인다(`setNotificationHandler`) — 핸들러가 없으면 앱이 앞에 있는 동안 조용히
 * 지나가 그 회차를 놓친다(PR #146 리뷰). 소리는 내지 않는다. 다른 알림은 이 앱에 없지만, 생기면 기본(안 보임)으로 둔다.
 *
 * 켤 때 · 앱이 뒤로 갈 때 예약을 맞춘다. 새벽에 남긴 기록은 앱이 뒤로 가는 순간 세어진다.
 * **앱 뿌리(`app/_layout.tsx`)에서 부른다** — 위젯으로 켜면 탭을 거치지 않고 새벽 화면만 열린다
 */
export function useReminderSync() {
  useEffect(() => {
    const N = notifications();
    if (!N) return;
    N.setNotificationHandler({
      handleNotification: async (n) => {
        const mine = n.request.identifier === REMINDER_ID;
        return { shouldShowBanner: mine, shouldShowList: mine, shouldPlaySound: false, shouldSetBadge: false };
      },
    });
    void syncReminder().catch(() => {});
    // 뒤로 갈 때 — 새벽 기록이 세어진다. 앞으로 올 때 — 설정 앱에서 알림을 켜고 돌아온 경우(PR #146 리뷰)
    const app = AppState.addEventListener('change', () => void syncReminder().catch(() => {}));
    return () => app.remove();
  }, []);
}

/**
 * 알림을 누르면 꿈 로그로 간다. 앱이 꺼져 있었으면 시작할 때 마지막 응답을 꺼낸다.
 * 탭 레이아웃에서 부른다 — 옮겨 갈 곳(꿈 로그)이 그 안에 있고, 그때는 길잡이가 준비돼 있다
 */
export function useReminderTap() {
  const router = useRouter();
  useEffect(() => {
    const N = notifications();
    if (!N) return;
    const open = (r: { notification: { request: { identifier: string } } } | null) => {
      if (r?.notification.request.identifier !== REMINDER_ID) return;
      router.navigate(TARGET);
      // 다음에 앱을 켤 때 같은 응답으로 다시 옮겨 가지 않게
      N.clearLastNotificationResponse();
    };
    const tap = N.addNotificationResponseReceivedListener(open);
    // 앱이 꺼져 있다가 알림으로 켜졌으면 리스너보다 먼저 와 있다. 둘 다 같은 응답을 받아도 같은 곳으로 갈 뿐이다
    open(N.getLastNotificationResponse());
    return () => tap.remove();
  }, [router]);
}
