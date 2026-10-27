import { useFocusEffect, useRouter } from 'expo-router';
import { Bell, FileText, LayoutGrid, Pencil, Shield, Smile, UserMinus, UserX } from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';

import { Button, Card, Chip, ListRow, Radio, Row, Screen, Sheet, showToast, Skeleton, Stack, Title } from '@components';
import { COMIC_ENABLED, GENDER_OPTIONS, genderLabel, parseGender } from '@features/comic';
import { NicknameSheet } from '@features/community/NicknameSheet';
import { ConsentSheet } from '@features/consent/ConsentSheet';
import { CONSENT_VERSION, consentAction, needsConsent, recordConsent } from '@features/consent/logic';
import {
  askPermission,
  HAS_NOTIFICATIONS,
  openSystemSettings,
  permission,
  readReminderTime,
  REMINDER_TIMES,
  reminderLabel,
  saveReminderTime,
  type Permission,
  type ReminderTime,
} from '@features/reminder';
import type { ComicGender } from '@shared/api/comic';
import { appleAvailable, HAS_NATIVE_APPLE, useAuth, type Provider } from '@shared/auth';
import { getDreamRepo, SETTINGS } from '@shared/db';
import { STORYBOOK_ENABLED } from '@shared/storybook';
import { syncIfSignedIn } from '@shared/sync';
import { openWebPage, PRIVACY_URL, TERMS_URL } from '@shared/web';
import { AppText } from '@shared/ui';
import { c, hit, r, sp } from '@theme/token';

/**
 * MY-1. 계정(로그인 · 닉네임) · 위젯 설치 다시 보기 · 차단한 사용자 · 이용약관 · 개인정보처리방침(MY-3 · 4) ·
 * 개발용 줄 · 계정 삭제(MY-5, 이슈 #65)
 */
export default function MyScreen() {
  const router = useRouter();
  const auth = useAuth();
  const [renaming, setRenaming] = useState(false);
  const { refresh } = auth;
  // 로그인 · 로그아웃이 실패한 이유는 계정 카드 안에 적고, 토스트로도 띄운다(2026-10-08 사용자 요청)
  useEffect(() => {
    if (auth.error) showToast(auth.error);
  }, [auth.error]);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deletedNotice, setDeletedNotice] = useState<string | null>(null);

  /**
   * 만화 주인공 성별(이슈 #117, 2026-10-13 사용자 요청 — "회원가입 또는 프로필 설정에서 본인의 성별을 지정할 수 있게 해줘.
   * 꿈 만화에서 주인공의 성별을 위해서"). 가입 흐름에는 넣지 않는다 — 만화를 만들지 않는 사람에게 받을 이유가 없다.
   * 폰에만 두고 만화를 만들 때만 보낸다. 로그아웃하면 지워지므로 포커스마다 다시 읽는다
   */
  const [gender, setGender] = useState<ComicGender | null>(null);
  const [pickingGender, setPickingGender] = useState(false);
  const readGender = useCallback(() => {
    void getDreamRepo()
      .then((repo) => repo.getSetting(SETTINGS.comicGender))
      .then((v) => setGender(parseGender(v)))
      .catch(() => {});
  }, []);
  useFocusEffect(readGender);
  const pickGender = (value: ComicGender | '') => {
    setPickingGender(false);
    void getDreamRepo()
      .then((repo) => repo.setSetting(SETTINGS.comicGender, value))
      .then(() => setGender(parseGender(value)))
      .catch(() => showToast('저장하지 못했어요. 다시 골라 주세요.'));
  };

  /**
   * 낮 확인 알림(이슈 #145 · 계획서 ON-4). 기본은 꺼 둔다. 켤 때 이유를 먼저 보이고 시스템 권한 창을 띄운다 —
   * 거부했으면 창이 다시 뜨지 않으므로 설정 앱으로 가는 버튼을 보인다. 설정 앱에서 돌아오면 포커스마다 다시 읽는다
   */
  const [reminder, setReminder] = useState<ReminderTime | null>(null);
  const [notifyPerm, setNotifyPerm] = useState<Permission>('unavailable');
  const [pickingReminder, setPickingReminder] = useState(false);
  // 이번에 시각을 골랐는데 허락받지 못했다 — 「설정 열기」를 보인다
  const [refused, setRefused] = useState(false);
  const readReminder = useCallback(() => {
    if (!HAS_NOTIFICATIONS) return;
    void Promise.all([readReminderTime(), permission()])
      .then(([t, p]) => {
        setReminder(t);
        setNotifyPerm(p);
      })
      .catch(() => {});
  }, []);
  useFocusEffect(readReminder);
  const pickReminder = async (time: ReminderTime | null) => {
    try {
      if (time) {
        const p = notifyPerm === 'granted' ? 'granted' : await askPermission();
        setNotifyPerm(p);
        // 허락하지 않았으면 켜지 않는다 — 켜진 것처럼 보이는데 울리지 않는 것이 가장 나쁘다. 시트에 이유가 남는다
        if (p !== 'granted') {
          setRefused(true);
          return;
        }
      }
      await saveReminderTime(time);
      setReminder(time);
      setRefused(false);
      setPickingReminder(false);
    } catch {
      showToast('저장하지 못했어요. 다시 골라 주세요.');
    }
  };
  // 켜 두었는데 설정 앱에서 알림을 끈 경우 — 시각 대신 그 사실을 보인다
  const reminderValue = reminder && notifyPerm !== 'granted' ? '설정에서 꺼짐' : reminderLabel(reminder);

  // 빠르게 두 번 누르면 `auth.busy`가 버튼을 끄기 전에 두 번 들어온다 — 다시 그리기를 기다리지 않는 ref 로 막는다(PR #68 리뷰)
  const deletingNow = useRef(false);
  const confirmDelete = () => {
    if (deletingNow.current) return;
    deletingNow.current = true;
    setDeleteError(null);
    void auth
      .deleteAccount()
      .finally(() => {
        deletingNow.current = false;
      })
      .then((r) => {
      if (r.result === 'deleted') {
        setDeleting(false);
        setDeletedNotice('계정을 삭제했어요. 폰에 있는 기록은 그대로 남아 있어요.');
      } else {
        // 다시 로그인 · 실패 — 세션은 그대로라 시트를 열어 둔 채 이유만 보인다
        setDeleteError(r.message);
        showToast(r.message);
      }
    });
  };

  // 탭은 떠 있는 채로 남는다. 프로필에서 닉네임을 바꾸고 돌아와도 새 이름이 보이게 세션을 다시 읽는다
  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  /**
   * 가입 동의(이슈 #71). 로그인하기 전에 받고, **이미 로그인한 사람도 이번 버전에 동의하지 않았으면** 마이 탭을 열 때
   * 한 번 받는다 — 동의 시트가 생기기 전에 가입한 사람, 문서가 바뀐 경우. 동의하지 않으면 로그아웃한다
   * (서버 기록 · 꿈 나눔은 동의한 계정만). 폰의 기록은 그대로다.
   *
   * **로그인한 뒤에는 서버 값을 믿는다**(계약 072) — 다른 기기에서 동의했으면 묻지 않는다. 판단은 `consentAction`.
   *
   * **로그인할 때는 구글 계정을 고른 뒤에 묻는다**(문서 074, 2026-10-08 사용자 요청 — "한번 동의하면 그 이후에는 안떠야하지
   * 않아? 그리고 계정 선택 이후 해당 시트가 떠야하는거 아니야?"). 동의 값 없이 로그인해 보고, 서버가 꾸메 계정이 없다고
   * 하면(`consent_required`) 그때 시트를 띄운다(`signUp`). 이미 있는 계정은 시트 없이 들어가고, 동의가 없거나 옛 버전이면
   * 아래 포커스 확인이 로그인 직후 묻는다(`existing`)
   */
  const [consent, setConsent] = useState<null | 'signUp' | 'existing'>(null);
  const readLocalConsent = useCallback(() => getDreamRepo().then((repo) => repo.getSetting(SETTINGS.consent)), []);
  const setConsentRecord = (value: string) => getDreamRepo().then((repo) => repo.setSetting(SETTINGS.consent, value));
  const signedIn = !!auth.session;
  const { serverConsent, sendConsent } = auth;
  useFocusEffect(
    useCallback(() => {
      if (!signedIn) return;
      // 서버를 기다리는 사이 로그아웃하면(또는 탭을 떠나면) 이 확인은 버린다 — 지운 계정의 시트를 띄우거나,
      // 거기서 받은 동의가 다음 계정으로 넘어가지 않게(PR #77 리뷰)
      let alive = true;
      void (async () => {
        const local = await readLocalConsent();
        const server = await serverConsent(CONSENT_VERSION);
        if (!alive) return;
        const action = consentAction(local, server);
        if (action === 'ask') setConsent('existing');
        // 서버가 이미 안다 — 폰 기록도 맞춰 둔다(오프라인으로 열었을 때 다시 묻지 않게)
        else if (action === 'skip' && server === CONSENT_VERSION && needsConsent(local)) {
          await getDreamRepo().then((repo) => repo.setSetting(SETTINGS.consent, recordConsent()));
        }
        // 이 폰에서 동의했는데 서버에 없다 — 조용히 올린다. 실패하면 다음에 마이 탭을 열 때 다시
        else if (action === 'upload') await sendConsent(CONSENT_VERSION).catch(() => {});
      })().catch(() => {});
      return () => {
        alive = false;
      };
    }, [signedIn, readLocalConsent, serverConsent, sendConsent]),
  );
  // 폰에 남은 동의를 로그인 요청에 싣지 않는다 — 로그아웃한 채 남은 동의는 누구의 것인지 알 수 없다(PR #77 리뷰).
  // 새 계정이면 그 자리에서 묻고, 시트는 열 때마다 체크가 비어 있다
  // busy는 다시 그린 뒤에야 바뀐다 — 그 사이 애플 · 구글을 연달아 누르면 두 시도가 pending을 덮어쓴다(PR #87 리뷰)
  const signingIn = useRef(false);
  const startSignIn = (provider: Provider = 'google') => {
    if (auth.busy || signingIn.current) return;
    signingIn.current = true;
    void auth
      .signIn(provider)
      .then((res) => {
        if (res === 'consent') setConsent('signUp');
      })
      .finally(() => {
        signingIn.current = false;
      });
  };
  // 애플 로그인은 iOS 13 이상 · 모듈이 든 빌드에서만 뜬다. 안드로이드에는 버튼이 없다
  const [canApple, setCanApple] = useState(false);
  useEffect(() => {
    let alive = true;
    void appleAvailable().then((ok) => alive && setCanApple(ok));
    return () => {
      alive = false;
    };
  }, []);
  const [consentError, setConsentError] = useState<string | null>(null);
  const agree = () => {
    const after = consent;
    setConsentError(null);
    // 폰에 먼저 저장한다 — 로그인이 되는 순간 위의 포커스 확인이 다시 물으면 안 되므로.
    // 저장이 실패하면 시트를 열어 둔 채 이유를 보인다(PR #73 리뷰)
    void setConsentRecord(recordConsent())
      .then(async () => {
        setConsent(null);
        if (after === 'existing') {
          // 서버에 남긴다. 실패해도(오프라인) 시트를 다시 띄우지 않는다 — 폰에 동의가 있으니 다음 포커스가 조용히 다시 올린다
          await sendConsent(CONSENT_VERSION).catch(() => {});
          // 동의 전에는 동기화가 멈춰 있었다 — 폰에 동의가 남았으니 지금 올린다
          void syncIfSignedIn({ force: true });
          return;
        }
        if (after !== 'signUp') return;
        // 고른 계정의 같은 토큰에 동의를 실어 다시 보낸다 — 서버가 계정을 만드는 것과 같은 트랜잭션에 기록한다(계약 072).
        // **로그인이 실패하면 동의를 지운다**(PR #73 리뷰) — 남겨 두면 다음에 이 폰으로 다른 사람이 로그인할 때
        // 묻지 않고 지나간다. 동의는 계정의 것이다
        const ok = await auth.finishSignUp(CONSENT_VERSION);
        if (!ok) await setConsentRecord('').catch(() => {});
      })
      .catch((e) => {
        setConsentError(`동의를 저장하지 못했어요. 다시 눌러 주세요.\n${String(e)}`);
        showToast('동의를 저장하지 못했어요. 다시 눌러 주세요.');
      });
  };
  const declineConsent = () => {
    const was = consent;
    setConsent(null);
    if (was === 'existing') void auth.signOut();
    // 가입을 그만뒀다 — 고른 구글 계정과 들고 있던 토큰을 놓는다. 서버에는 아무것도 생기지 않았다
    if (was === 'signUp') void auth.cancelSignUp();
  };

  return (
    // 탭 제목도 위에 고정한다 — 다른 탭(꿈 로그 · 꿈 나눔)은 목록만 스크롤돼 이미 그렇다(2026-10-03)
    <Screen scroll header={<Title>마이</Title>}>

      {/* **로그인이 여기 있는 이유.** 새벽 흐름에는 로그인을 두지 않는다 —
          위젯을 눌렀는데 로그인 화면이 뜨면 그 기록이 사라진다(절대 규칙 1).
          로그인은 낮에 마이 탭에서 스스로 하는 일이고, 그 전까지 기록은
          `user_id`가 빈 채로 로컬에 쌓인다. 로그인해야 동기화가 붙는다 */}
      <Card>
        {auth.loading ? (
          <Stack gap={sp[2]}>
            <Skeleton width="50%" height={18} />
            <Skeleton width="70%" height={12} />
          </Stack>
        ) : auth.session ? (
          <Stack gap={sp[3]}>
            {/* 닉네임을 커뮤니티를 거치지 않고 여기서도 바꾼다(이슈 #63). 프로필과 같은 시트다 */}
            <Row gap={sp[2]}>
              <AppText size="label" weight="semibold" style={{ flex: 1 }} numberOfLines={1}>
                {auth.session.user.nickname}
              </AppText>
              {/* 곁가지 동작이라 큰 버튼이 아니라 이름 옆의 작은 칩(2026-10-03 사용자 요청) */}
              <Chip label="닉네임 바꾸기" icon={Pencil} iconOnly onPress={() => setRenaming(true)} />
            </Row>
            <AppText size="caption" color={c.fgFaint}>
              기록이 서버에 함께 보관돼요
            </AppText>
            <Button
              label="로그아웃"
              variant="ghost"
              size="sm"
              loading={auth.busy}
              onPress={() => void auth.signOut()}
            />
          </Stack>
        ) : (
          <Stack gap={sp[3]}>
            <AppText size="label" weight="semibold">
              로그인하지 않아도 기록은 돼요
            </AppText>
            <AppText size="caption" color={c.fgFaint}>
              로그인하면 기기를 바꿔도 기록이 따라와요.
            </AppText>
            {canApple && <AppleButton onPress={() => startSignIn('apple')} />}
            <Button
              label="구글로 계속하기"
              loading={auth.busy}
              onPress={() => startSignIn('google')}
            />
            {/* 동의는 누르면 뜨는 시트에서 받는다(이슈 #71). 여기서는 무엇이 있는지만 */}
            <AppText size="caption" color={c.fgFaint}>
              만 14세 이상만 로그인할 수 있어요.{' '}
              <AppText size="caption" color={c.fgMuted} weight="semibold" onPress={() => void openWebPage(TERMS_URL)}>
                이용약관
              </AppText>
              {' · '}
              <AppText size="caption" color={c.fgMuted} weight="semibold" onPress={() => void openWebPage(PRIVACY_URL)}>
                개인정보처리방침
              </AppText>
            </AppText>
          </Stack>
        )}

        {!!auth.error && (
          <AppText size="caption" color={c.danger} style={{ marginTop: sp[3] }}>
            {auth.error}
          </AppText>
        )}
      </Card>

      <Stack gap={sp[3]}>
        {/* 온보딩에서 건너뛴 사람이 돌아오는 자리다. ON-7은 최대 이탈 지점이라
            다시 열 길이 없으면 위젯 없이 쓰는 사용자가 그대로 남는다 */}
        <ListRow
          icon={LayoutGrid}
          label="잠금화면 위젯 설치"
          onPress={() => router.push('/onboarding?step=widget')}
          highlight
        />
        {HAS_NOTIFICATIONS && (
          <ListRow icon={Bell} label="낮 확인 알림" value={reminderValue} onPress={() => setPickingReminder(true)} />
        )}
        {/* 차단은 서버에 있어 로그인해야 의미가 있다. 전에는 그 사람의 프로필까지 가야 풀 수 있었다 */}
        {!!auth.session && <ListRow icon={UserX} label="차단한 사용자" onPress={() => router.push('/blocks')} />}
        {/* 만화는 로그인해야 만든다 — 로그인 전에는 정할 이유가 없다 */}
        {!!auth.session && COMIC_ENABLED && (
          <ListRow icon={Smile} label="만화 주인공" value={genderLabel(gender)} onPress={() => setPickingGender(true)} />
        )}
      </Stack>

      {/* "기상 시각"과 "기상 알림"이 여기 있었다. **안 하기로 한 것**이라 지웠다 — 진입점을 위젯 하나로 좁히면서
          (2026-09-01) 고정 알림을 뺐고, 기상 시각은 그 알림을 언제 다시 올릴지 알기 위한 값이었다(문서 009).
          알림은 위의 「낮 확인 알림」(LOG-3 유도, 이슈 #145)으로만 돌아왔다 — 시각은 기상 시각이 아니라 고르는 값이다 */}

      <Stack gap={sp[3]}>
        <AppText size="caption" color={c.fgFaint}>
          개발용
        </AppText>
        {/* 스토리북을 뺀 번들(preview 빌드 · OTA)에서는 줄 자체를 숨긴다.
            누르면 갈 곳이 없는 버튼을 두지 않는다 */}
        {STORYBOOK_ENABLED && (
          <ListRow label="스토리북 열기" onPress={() => router.push('/storybook')} />
        )}
        {/* 스토리북은 preview 빌드에서 꺼진다. 정작 판정이 필요한 빌드라 진단은 따로 둔다 */}
        <ListRow label="빌드 진단" onPress={() => router.push('/diag')} />
      </Stack>

      {/* MY-3 · 4 — 공개 페이지(저장소 site/ · GitHub Pages)를 앱 안 브라우저로 연다 */}
      <Stack gap={sp[3]}>
        <ListRow icon={FileText} label="이용약관" onPress={() => void openWebPage(TERMS_URL)} />
        <ListRow icon={Shield} label="개인정보처리방침" onPress={() => void openWebPage(PRIVACY_URL)} />
      </Stack>

      {/* MY-5 계정 삭제 — 맨 아래, 다른 줄과 떨어진 위험색(계획서 001 · 003). 로그인했을 때만 */}
      {!!auth.session && (
        <Stack gap={sp[3]} style={{ marginTop: sp[6] }}>
          <ListRow icon={UserMinus} label="계정 삭제" danger onPress={() => setDeleting(true)} />
        </Stack>
      )}
      {!!deletedNotice && (
        <Card>
          <AppText size="caption" color={c.fgMuted}>
            {deletedNotice}
          </AppText>
        </Card>
      )}

      <Sheet
        visible={pickingGender}
        onClose={() => setPickingGender(false)}
        title="만화 주인공"
        description="꿈 만화의 주인공을 이 성별로 그려요. 정하지 않으면 꿈 내용을 보고 정해요. 이 폰에만 저장되고, 만화를 만들 때만 함께 보내요.">
        <Stack gap={sp[1]}>
          {GENDER_OPTIONS.map((o) => (
            <Radio
              key={o.value || 'none'}
              selected={(gender ?? '') === o.value}
              onSelect={() => pickGender(o.value)}
              label={o.label}
            />
          ))}
        </Stack>
      </Sheet>

      <Sheet
        visible={pickingReminder}
        onClose={() => {
          setPickingReminder(false);
          setRefused(false);
        }}
        title="낮 확인 알림"
        description="확인 안 한 꿈 기록이 있을 때만, 고른 시각에 한 번 알려 드려요. 기억이 남아 있을 때 다듬을 수 있게요.">
        <Stack gap={sp[3]}>
          <Stack gap={sp[1]}>
            <Radio selected={!reminder} onSelect={() => void pickReminder(null)} label="끄기" />
            {REMINDER_TIMES.map((t) => (
              <Radio
                key={t.value}
                selected={reminder === t.value}
                onSelect={() => void pickReminder(t.value)}
                label={t.label}
              />
            ))}
          </Stack>
          {(notifyPerm === 'denied' || refused) && notifyPerm !== 'granted' && (
            <Stack gap={sp[2]}>
              <AppText size="caption" color={c.fgMuted}>
                알림이 꺼져 있어요. 설정에서 꾸메의 알림을 켠 뒤 다시 골라 주세요.
              </AppText>
              <Button label="설정 열기" size="sm" variant="ghost" onPress={openSystemSettings} />
            </Stack>
          )}
        </Stack>
      </Sheet>

      {/* 지워지는 것과 남는 것을 먼저 말한다(계약 064 06장). 낮 화면이라 확인 한 번은 절대 규칙 7에 걸리지 않는다 */}
      <Sheet visible={deleting} onClose={() => !auth.busy && setDeleting(false)} title="계정을 삭제할까요">
        <Stack gap={sp[5]}>
          <Stack gap={sp[2]}>
            <AppText color={c.fgMuted}>
              서버에 있는 꿈 기록 · 녹음 · 꿈 나눔 글 · 댓글 · 공감 · 차단 목록이{' '}
              <AppText weight="semibold">바로 지워지고 되돌릴 수 없어요.</AppText>
            </AppText>
            <AppText color={c.fgMuted}>폰에 있는 꿈 기록과 녹음은 그대로 남아요.</AppText>
            <Button label="개인정보처리방침에서 자세히" size="sm" variant="ghost" onPress={() => void openWebPage(PRIVACY_URL)} />
            {!!deleteError && (
              <AppText size="caption" color={c.danger}>
                {deleteError}
              </AppText>
            )}
          </Stack>
          <Stack gap={sp[2]}>
            <Button label="계정 삭제" variant="danger" loading={auth.busy} onPress={confirmDelete} />
            <Button label="취소" variant="ghost" disabled={auth.busy} onPress={() => setDeleting(false)} />
          </Stack>
        </Stack>
      </Sheet>

      <ConsentSheet
        visible={consent !== null}
        onAgree={agree}
        // 이미 로그인한 사람은 바깥을 눌러도 닫히지 않는다 — 고르게 한다(실수로 로그아웃되지 않게)
        onClose={consent === 'existing' ? () => {} : declineConsent}
        onDismiss={declineConsent}
        dismissLabel={consent === 'existing' ? '동의하지 않고 로그아웃' : '취소'}
        busy={auth.busy}
        error={consentError}
      />

      {/* 시트가 세션을 저장한 뒤 이 탭이 들고 있는 세션도 다시 읽는다 */}
      <NicknameSheet
        visible={renaming}
        onClose={() => setRenaming(false)}
        current={auth.session?.user.nickname ?? ''}
        onSaved={() => void refresh()}
      />
    </Screen>
  );
}

/**
 * 「Apple로 계속하기」. **애플이 주는 버튼을 그대로 쓴다** — 로고 · 글자 · 색을 직접 그리면 App Store 심사에서 거절된다
 * (Human Interface Guidelines). 글자는 기기 언어를 따른다. 높이 · 모서리만 우리 버튼과 맞춘다.
 * 모듈은 있을 때만 부른다(절대 규칙 10) — 안드로이드에서는 그 자리에 아무것도 없다
 */
function AppleButton({ onPress }: { onPress: () => void }) {
  if (!HAS_NATIVE_APPLE) return null;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Apple = require('expo-apple-authentication') as typeof import('expo-apple-authentication');
  return (
    <Apple.AppleAuthenticationButton
      buttonType={Apple.AppleAuthenticationButtonType.CONTINUE}
      // 어두운 화면이라 흰 버튼
      buttonStyle={Apple.AppleAuthenticationButtonStyle.WHITE}
      cornerRadius={r.control}
      style={{ height: hit.base }}
      onPress={onPress}
    />
  );
}
