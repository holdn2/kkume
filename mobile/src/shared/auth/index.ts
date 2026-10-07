import { useCallback, useEffect, useState } from 'react';

import { deleteMe, loginWithGoogle } from '@shared/api/auth';
import { isApiError, setAccountDeletedHandler } from '@shared/api/client';
import { getDreamRepo, SETTINGS } from '@shared/db';
import { pauseSync, resetSyncPosition, syncIfSignedIn } from '@shared/sync';

import { deleteAccount as runDeletion, onceAtATime, runSteps, type DeletionResult } from './deletion';
import { signInWithGoogle, signOutFromGoogle } from './google';
import { clearSession, isExpired, loadSession, saveSession, toSession, type Session } from './session';

export type { DeletionResult } from './deletion';

/**
 * 계정이 없어졌을 때(이 기기에서 지웠거나, 다른 기기에서 지운 계정의 토큰이 `401 account_deleted`를 받았을 때)
 * 이 기기의 계정 흔적을 지운다 — 구글 로그아웃 · 세션 · 받기 위치 · "올렸음" 표시. **폰의 기록은 남긴다**
 * (2026-10-05 사용자 결정 · 계약 064). 여러 요청이 한꺼번에 받아도 한 번만 돈다
 */
const goneListeners = new Set<() => void>();

/** 계정이 없어지면 부른다 — 화면의 세션 상태 · 커뮤니티 캐시가 듣는다. 듣기를 그만두는 함수를 돌려준다 */
export function onAccountGone(fn: () => void): () => void {
  goneListeners.add(fn);
  return () => goneListeners.delete(fn);
}

export const forgetAccount = onceAtATime(() =>
  runSteps(
    [
      () => signOutFromGoogle(),
      () => clearSession(),
      () => resetSyncPosition(),
      // 서버의 기록은 지워졌다 — "이미 올렸다"가 남으면 새 계정으로 로그인했을 때 영영 안 올라간다(계약 064 06장)
      async () => (await getDreamRepo()).clearUploadMarks(),
      // 동의는 계정의 것이다 — 다음에 로그인하는 계정이 다시 동의한다(이슈 #71)
      async () => (await getDreamRepo()).setSetting(SETTINGS.consent, ''),
    ],
    // 한 단계가 실패해도 화면 · 캐시에는 알린다 — 세션은 이미 지웠는데 화면만 로그인한 채로 남지 않게(PR #68 리뷰)
    () => goneListeners.forEach((fn) => fn()),
  ),
);

// 모든 요청이 지나는 `request()`가 `account_deleted`를 보면 여기로 온다(계약 064 06장)
setAccountDeletedHandler(() => void forgetAccount().catch(() => {}));

export { googleBackend, HAS_NATIVE_GOOGLE } from './google';
export { sessionBackend, type Session } from './session';

export type AuthState = {
  /** 아직 저장소를 읽는 중이면 `null`. 화면은 이때 아무것도 결정하지 않는다 */
  session: Session | null;
  loading: boolean;
  busy: boolean;
  error: string | null;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  /** 계정 삭제(MY-5, 이슈 #65). 성공하면 이 훅의 세션도 비워진다 */
  deleteAccount: () => Promise<DeletionResult>;
  /** 저장된 세션을 다시 읽는다 */
  refresh: () => Promise<void>;
};

/**
 * **로그인은 기록 앞에 서지 않는다.**
 *
 * 새벽에 위젯을 눌렀는데 로그인 화면이 뜨면 그 기록은 사라진다. 절대 규칙 1이
 * 막으려는 실패가 정확히 그것이라, 이 훅은 화면을 막는 용도로 쓰지 않는다.
 * 로그인은 마이 탭에서 사용자가 낮에 스스로 하는 일이고, 그 전까지 기록은
 * `user_id`가 비어 있는 채로 로컬에 쌓인다.
 */
export function useAuth(): AuthState {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // effect 본문에서 setState를 하지 않는다(react-hooks/set-state-in-effect).
    // 저장소 읽기가 끝난 뒤 콜백에서 넣는다
    let alive = true;
    loadSession()
      .then((s) => {
        if (!alive) return;
        // 만료된 것은 없는 것으로 본다. 들고 있어도 401만 받는다
        setSession(s && !isExpired(s) ? s : null);
        setLoading(false);
      })
      .catch(() => {
        if (!alive) return;
        setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  const signIn = useCallback(async () => {
    setBusy(true);
    setError(null);
    // try 바깥에 둔다. catch에서 함께 보여줘야 하는데 안에 두면 안 보인다
    let aud: string | null = null;
    try {
      const g = await signInWithGoogle();
      if (!g.ok) {
        // 취소는 실패가 아니다. 사용자가 스스로 닫은 것에 오류 문구를 띄우면
        // 자기가 뭘 잘못한 줄 알고 다시 시도하지 않는다
        if (g.reason === 'cancelled') return;
        // **`detail`을 버리지 않는다.** 2026-09-12에 계정 선택까지 되고 그 뒤에 실패했는데,
        // 화면에 "구글 로그인에 실패했습니다"만 떠서 **원인을 좁힐 근거가 하나도 없었다.**
        // 구글 쪽 오류는 코드가 제각각이라 미리 문구를 매핑해 둘 수 없다 —
        // 받은 것을 그대로 보여주는 편이 낫다. 개발 중에만 보이는 화면이 아니라
        // 마이 탭이지만, 로그인 실패는 사용자도 스크린샷을 찍어 알려야 하는 상황이다
        const base =
          g.reason === 'unavailable'
            ? '이 빌드에는 구글 로그인이 들어 있지 않습니다'
            : '구글 로그인에 실패했습니다';
        setError(g.detail ? `${base}\n${g.detail}` : base);
        return;
      }
      // **실패하면 토큰의 `aud`를 함께 보여준다.** 서버는 이 값이 허용 목록에
      // 없으면 401을 주는데 이유를 알려주지 않는다(일부러 그렇게 만들었다).
      // 그러면 화면만 보고는 "서버가 안 뜬 것"과 "대상이 안 맞는 것"을 못 가른다.
      // 임시가 아니라 남겨 둔다 — 클라이언트 ID는 앱에 어차피 박혀 있어 비밀이 아니고,
      // 이 한 줄이 없으면 다음에 같은 자리에서 또 막힌다
      aud = audienceOf(g.idToken);
      const res = await loginWithGoogle(g.idToken);
      const s = toSession(res);
      await saveSession(s);
      setSession(s);
      // 로그인 전에 쌓인 기록을 바로 올린다. 소유자는 서버가 토큰에서 정하므로
      // 로컬 `user_id`를 따로 잇지 않아도 이 사용자 것이 된다.
      // 기다리지 않는다 — 로그인 완료가 동기화에 묶이면 느린 망에서 버튼이 안 풀린다
      void syncIfSignedIn({ force: true });
    } catch (e) {
      // 서버가 주는 문구는 이미 존댓말이라 그대로 보여준다
      const base = isApiError(e) ? e.message : '로그인에 실패했습니다';
      setError(aud ? `${base}\n토큰 대상: ${aud}` : base);
    } finally {
      setBusy(false);
    }
  }, []);

  const signOut = useCallback(async () => {
    setBusy(true);
    try {
      await signOutFromGoogle();
      await clearSession();
      // 받기 위치를 지운다. 다음에 다른 계정이 로그인하면 그 계정 기록을 처음부터 받아야 한다
      await resetSyncPosition();
      // 동의는 계정의 것이다 — 다음에 로그인하는 계정이 다시 동의한다(이슈 #71)
      await (await getDreamRepo()).setSetting(SETTINGS.consent, '');
      setSession(null);
    } finally {
      setBusy(false);
    }
  }, []);

  /**
   * 저장된 세션을 다시 읽는다. 다른 곳이 세션을 고쳤을 때 쓴다 — 닉네임 바꾸기(이슈 #63)가
   * 세션의 닉네임을 바꿔 저장하면, 이 훅이 들고 있던 옛 닉네임을 새로 맞춘다
   */
  const refresh = useCallback(async () => {
    const s = await loadSession();
    setSession(s && !isExpired(s) ? s : null);
  }, []);

  // 계정이 없어지면(여기서 지웠든, 다른 기기에서 지운 것을 요청이 알아챘든) 로그인 전으로
  useEffect(() => onAccountGone(() => setSession(null)), []);

  const deleteAccount = useCallback(async () => {
    setBusy(true);
    try {
      return await runDeletion({
        pauseSync,
        callDelete: async () => {
          const s = await loadSession();
          // 만료된 토큰을 보내면 서버가 401 unauthorized — 같은 안내로 간다
          if (!s || isExpired(s)) throw { code: 'unauthorized', message: '', status: 401 };
          await deleteMe(s.accessToken);
        },
        // 서버는 이미 지웠다 — 이 기기 정리의 한 단계가 실패해도 결과는 "지웠음"이다(알림은 runSteps 가 보장)
        forget: () => forgetAccount().catch(() => {}),
      });
    } finally {
      setBusy(false);
    }
  }, []);

  return { session, loading, busy, error, signIn, signOut, deleteAccount, refresh };
}

/**
 * ID 토큰의 `aud`를 꺼낸다. **서명은 검증하지 않는다** — 그건 서버 일이고,
 * 여기서는 어느 클라이언트를 대상으로 발급됐는지 보여주기만 한다.
 *
 * 서버의 허용 목록과 이 값이 다르면 401이 나는데, 서버가 이유를 안 알려주므로
 * 앱이 스스로 말해 주지 않으면 원인을 못 찾는다.
 */
function audienceOf(jwt: string): string | null {
  try {
    const payload = jwt.split('.')[1];
    if (!payload) return null;
    // base64url이라 표준 base64로 바꾼 뒤 길이를 맞춘다
    const b64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
    const claims = JSON.parse(globalThis.atob(padded)) as { aud?: string | string[] };
    const a = claims.aud;
    return Array.isArray(a) ? a.join(', ') : (a ?? null);
  } catch {
    // 모양이 다르면 그냥 안 보여준다. 여기서 던지면 로그인이 막힌다
    return null;
  }
}
