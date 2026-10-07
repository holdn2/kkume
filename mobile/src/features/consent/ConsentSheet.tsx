import { Check, ChevronRight } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Button, Row, Sheet, Stack } from '@components';
import { AppText } from '@shared/ui';
import { openWebPage, PRIVACY_URL, TERMS_URL } from '@shared/web';
import { c, hit, press, r, sp } from '@theme/token';

import { CONSENT_ITEMS, canAgree, type ConsentKey } from './logic';

type Props = {
  visible: boolean;
  /** 「동의하고 계속」 — 기록을 저장하는 것은 부른 쪽이다 */
  onAgree: () => void;
  /** 바깥을 누르거나 끌어내릴 때. 이미 로그인한 사람에게는 아무 일도 안 하게 둔다 — 실수로 로그아웃되지 않게 */
  onClose: () => void;
  /** 아래쪽 버튼(그만두기 · 동의하지 않고 로그아웃) */
  onDismiss: () => void;
  /** 아래쪽 버튼 이름. 로그인 전이면 「그만두기」, 이미 로그인한 사람이면 「로그아웃」 */
  dismissLabel: string;
  busy?: boolean;
  /** 저장 실패 같은 이유. 있으면 버튼 위에 보인다 */
  error?: string | null;
};

/**
 * 가입 동의 시트(이슈 #71). 셋 다 체크해야 「동의하고 계속」이 눌린다.
 * 낮 화면(마이 탭)에서만 뜬다 — 새벽 기록 흐름에는 로그인이 없다(절대 규칙 1 · 7).
 * 여는 순간마다 체크를 비운다 — 지난번에 체크하다 닫은 것이 남아 있으면 읽지 않고 넘어가게 된다
 */
export function ConsentSheet({ visible, onAgree, onClose, onDismiss, dismissLabel, busy, error }: Props) {
  const [checks, setChecks] = useState<Partial<Record<ConsentKey, boolean>>>({});
  const [wasVisible, setWasVisible] = useState(visible);
  if (wasVisible !== visible) {
    setWasVisible(visible);
    if (visible) setChecks({});
  }

  const all = CONSENT_ITEMS.every((i) => checks[i.key]);
  const toggleAll = () => setChecks(all ? {} : Object.fromEntries(CONSENT_ITEMS.map((i) => [i.key, true])));

  return (
    <Sheet visible={visible} onClose={onClose} title="꾸메를 쓰기 전에" description="로그인하면 기록이 서버에도 보관되고 꿈 나눔을 쓸 수 있습니다.">
      <Stack gap={sp[4]}>
        <CheckRow label="모두 동의합니다" checked={all} onPress={toggleAll} strong />
        <View style={s.line} />
        <Stack gap={sp[1]}>
          {CONSENT_ITEMS.map((item) => (
            <Row key={item.key} gap={sp[2]}>
              <View style={{ flex: 1 }}>
                <CheckRow
                  label={`[필수] ${item.label}`}
                  checked={!!checks[item.key]}
                  onPress={() => setChecks((p) => ({ ...p, [item.key]: !p[item.key] }))}
                />
              </View>
              {item.link && (
                <Pressable
                  onPress={() => void openWebPage(item.link === 'terms' ? TERMS_URL : PRIVACY_URL)}
                  hitSlop={8}
                  accessibilityRole="link"
                  accessibilityLabel={item.link === 'terms' ? '이용약관 보기' : '개인정보처리방침 보기'}
                  style={({ pressed }) => [s.view, pressed && { opacity: press }]}>
                  <AppText size="caption" color={c.fgMuted}>
                    보기
                  </AppText>
                  <ChevronRight size={14} strokeWidth={2} color={c.fgMuted} aria-hidden />
                </Pressable>
              )}
            </Row>
          ))}
        </Stack>
        <AppText size="caption" color={c.fgFaint}>
          받는 것: 구글 계정 식별자 · 닉네임 · 서버에 보관하는 꿈 기록과 녹음 · 꿈 나눔 글. 이메일 · 이름 · 사진은 받지
          않습니다. 계정은 마이 탭에서 언제든 삭제할 수 있습니다.
        </AppText>
        {!!error && (
          <AppText size="caption" color={c.danger}>
            {error}
          </AppText>
        )}
        <Stack gap={sp[2]}>
          <Button label={busy ? '진행 중' : '동의하고 계속'} disabled={!canAgree(checks) || busy} onPress={onAgree} />
          <Button label={dismissLabel} variant="ghost" disabled={busy} onPress={onDismiss} />
        </Stack>
      </Stack>
    </Sheet>
  );
}

function CheckRow({ label, checked, onPress, strong }: { label: string; checked: boolean; onPress: () => void; strong?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={label}
      style={({ pressed }) => [s.row, pressed && { opacity: press }]}>
      <View style={[s.box, checked && s.boxOn]}>{checked && <Check size={14} strokeWidth={3} color={c.actionFg} aria-hidden />}</View>
      <AppText size={strong ? 'label' : 'body'} weight={strong ? 'semibold' : 'regular'} style={{ flex: 1 }}>
        {label}
      </AppText>
    </Pressable>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: sp[3], minHeight: hit.min },
  box: {
    width: 22,
    height: 22,
    borderRadius: r.chip,
    borderWidth: 1.5,
    borderColor: c.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxOn: { backgroundColor: c.action, borderColor: c.action },
  line: { height: StyleSheet.hairlineWidth, backgroundColor: c.line },
  view: { flexDirection: 'row', alignItems: 'center', gap: 2, minHeight: hit.min, paddingLeft: sp[2] },
});
