import { NativeTabs } from 'expo-router/unstable-native-tabs';

import { useComicAccessory } from '@features/comic';
import { useReminderTap } from '@features/reminder';

/**
 * 시스템 탭바를 그대로 쓴다(계획서 10장). iOS 26에서는 Liquid Glass,
 * 그 아래는 기존 탭바, Android는 Material 3로 알아서 적응한다.
 *
 * **알파 API다.** 커스텀 스타일이 안 되고 시그니처가 바뀔 수 있다.
 * 대신 얻는 것이 크다 — 탭바는 OS마다 규칙이 다른데 그걸 직접 흉내 내면
 * 늘 어딘가 어색하고, 그 어색함을 고치는 데 드는 시간이 이 앱의 본체가 아니다.
 *
 * 새벽 기록 화면(`/record`)은 **여기 들어오지 않는다.** 탭바가 보이면
 * "다른 데 갈 수 있다"는 신호가 되고 그것이 곧 결정이다 (절대 규칙 7).
 */
export default function TabsLayout() {
  // 낮 확인 알림을 누르면 꿈 로그로(이슈 #145)
  useReminderTap();
  // 만화를 만드는 동안 탭바 위 진행 줄(CM-2, iOS 26 이상). 없으면 null
  const comicAccessory = useComicAccessory();
  return (
    <NativeTabs>
      {comicAccessory}
      <NativeTabs.Trigger name="log">
        <NativeTabs.Trigger.Icon sf={{ default: 'moon.stars', selected: 'moon.stars.fill' }} md="nightlight" />
        <NativeTabs.Trigger.Label>꿈로그</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="community">
        <NativeTabs.Trigger.Icon sf={{ default: 'bubble.left.and.bubble.right', selected: 'bubble.left.and.bubble.right.fill' }} md="forum" />
        <NativeTabs.Trigger.Label>꿈 나눔</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="quick">
        <NativeTabs.Trigger.Icon sf={{ default: 'mic', selected: 'mic.fill' }} md="mic" />
        <NativeTabs.Trigger.Label>빠른기록</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="my">
        <NativeTabs.Trigger.Icon sf={{ default: 'person', selected: 'person.fill' }} md="person" />
        <NativeTabs.Trigger.Label>마이</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
