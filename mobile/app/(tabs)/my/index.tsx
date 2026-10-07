import { useFocusEffect, useRouter } from 'expo-router';
import { FileText, LayoutGrid, Pencil, Shield, UserMinus, UserX } from 'lucide-react-native';
import { useCallback, useRef, useState } from 'react';

import { Button, Card, Chip, ListRow, Row, Screen, Sheet, Stack, Title } from '@components';
import { NicknameSheet } from '@features/community/NicknameSheet';
import { ConsentSheet } from '@features/consent/ConsentSheet';
import { needsConsent, recordConsent } from '@features/consent/logic';
import { useAuth } from '@shared/auth';
import { getDreamRepo, SETTINGS } from '@shared/db';
import { STORYBOOK_ENABLED } from '@shared/storybook';
import { openWebPage, PRIVACY_URL, TERMS_URL } from '@shared/web';
import { AppText } from '@shared/ui';
import { c, sp } from '@theme/token';

/**
 * MY-1. 계정(로그인 · 닉네임) · 위젯 설치 다시 보기 · 차단한 사용자 · 이용약관 · 개인정보처리방침(MY-3 · 4) ·
 * 개발용 줄 · 계정 삭제(MY-5, 이슈 #65)
 */
export default function MyScreen() {
  const router = useRouter();
  const auth = useAuth();
  const [renaming, setRenaming] = useState(false);
  const { refresh } = auth;
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deletedNotice, setDeletedNotice] = useState<string | null>(null);

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
        setDeletedNotice('계정을 삭제했습니다. 폰에 있는 기록은 그대로 남아 있습니다.');
      } else {
        // 다시 로그인 · 실패 — 세션은 그대로라 시트를 열어 둔 채 이유만 보인다
        setDeleteError(r.message);
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
   * (서버 기록 · 꿈 나눔은 동의한 계정만). 폰의 기록은 그대로다
   */
  const [consent, setConsent] = useState<null | 'signIn' | 'existing'>(null);
  const readConsent = useCallback(
    () => getDreamRepo().then((repo) => repo.getSetting(SETTINGS.consent)).then(needsConsent),
    [],
  );
  const signedIn = !!auth.session;
  useFocusEffect(
    useCallback(() => {
      if (!signedIn) return;
      void readConsent().then((need) => need && setConsent('existing'));
    }, [signedIn, readConsent]),
  );
  const startSignIn = () => {
    void readConsent().then((need) => (need ? setConsent('signIn') : void auth.signIn()));
  };
  const agree = () => {
    const after = consent;
    void getDreamRepo()
      .then((repo) => repo.setSetting(SETTINGS.consent, recordConsent()))
      .then(() => {
        setConsent(null);
        if (after === 'signIn') void auth.signIn();
      });
  };
  const declineConsent = () => {
    const was = consent;
    setConsent(null);
    if (was === 'existing') void auth.signOut();
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
          <AppText size="caption" color={c.fgFaint}>
            불러오는 중입니다
          </AppText>
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
              기록이 서버에 함께 보관됩니다
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
              로그인하지 않아도 기록은 됩니다
            </AppText>
            <AppText size="caption" color={c.fgFaint}>
              로그인하면 기기를 바꿔도 기록이 따라옵니다.
            </AppText>
            <Button
              label="구글로 계속하기"
              loading={auth.busy}
              onPress={startSignIn}
            />
            {/* 동의는 누르면 뜨는 시트에서 받는다(이슈 #71). 여기서는 무엇이 있는지만 */}
            <AppText size="caption" color={c.fgFaint}>
              만 14세 이상만 로그인할 수 있습니다.{' '}
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
        {/* 차단은 서버에 있어 로그인해야 의미가 있다. 전에는 그 사람의 프로필까지 가야 풀 수 있었다 */}
        {!!auth.session && <ListRow icon={UserX} label="차단한 사용자" onPress={() => router.push('/blocks')} />}
      </Stack>

      {/* "기상 시각"과 "기상 알림"이 여기 있었다. 만들다 만 것이 아니라
          **안 하기로 한 것**이라 지운다.
          진입점을 위젯 하나로 좁히면서(2026-09-01) 고정 알림을 뺐고,
          기상 시각은 그 알림을 언제 다시 올릴지 알기 위한 값이었다(문서 009).
          알림 자체가 없어지자 근거가 같이 사라졌다.
          LOG-3 유도 알림을 붙이는 4주차 이후에 그 문맥으로 다시 들어온다. */}

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

      {/* 지워지는 것과 남는 것을 먼저 말한다(계약 064 06장). 낮 화면이라 확인 한 번은 절대 규칙 7에 걸리지 않는다 */}
      <Sheet visible={deleting} onClose={() => !auth.busy && setDeleting(false)} title="계정을 삭제할까요">
        <Stack gap={sp[5]}>
          <Stack gap={sp[2]}>
            <AppText color={c.fgMuted}>
              서버에 있는 꿈 기록 · 녹음 · 꿈 나눔 글 · 댓글 · 공감 · 차단 목록이{' '}
              <AppText weight="semibold">바로 지워지고 되돌릴 수 없습니다.</AppText>
            </AppText>
            <AppText color={c.fgMuted}>폰에 있는 꿈 기록과 녹음은 그대로 남습니다.</AppText>
            <Button label="개인정보처리방침에서 자세히" size="sm" variant="ghost" onPress={() => void openWebPage(PRIVACY_URL)} />
            {!!deleteError && (
              <AppText size="caption" color={c.danger}>
                {deleteError}
              </AppText>
            )}
          </Stack>
          <Stack gap={sp[2]}>
            <Button label={auth.busy ? '지우는 중' : '계정 삭제'} variant="danger" disabled={auth.busy} onPress={confirmDelete} />
            <Button label="그만두기" variant="ghost" disabled={auth.busy} onPress={() => setDeleting(false)} />
          </Stack>
        </Stack>
      </Sheet>

      <ConsentSheet
        visible={consent !== null}
        onAgree={agree}
        // 이미 로그인한 사람은 바깥을 눌러도 닫히지 않는다 — 고르게 한다(실수로 로그아웃되지 않게)
        onClose={consent === 'existing' ? () => {} : declineConsent}
        onDismiss={declineConsent}
        dismissLabel={consent === 'existing' ? '동의하지 않고 로그아웃' : '그만두기'}
        busy={auth.busy}
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
