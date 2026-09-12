import { useCallback, useEffect, useState } from 'react';

import { loginWithGoogle } from '@shared/api/auth';
import { isApiError } from '@shared/api/client';

import { signInWithGoogle, signOutFromGoogle } from './google';
import { clearSession, isExpired, loadSession, saveSession, toSession, type Session } from './session';

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
    try {
      const g = await signInWithGoogle();
      if (!g.ok) {
        // 취소는 실패가 아니다. 사용자가 스스로 닫은 것에 오류 문구를 띄우면
        // 자기가 뭘 잘못한 줄 알고 다시 시도하지 않는다
        if (g.reason === 'cancelled') return;
        setError(
          g.reason === 'unavailable'
            ? '이 빌드에는 구글 로그인이 들어 있지 않습니다'
            : '구글 로그인에 실패했습니다',
        );
        return;
      }
      const res = await loginWithGoogle(g.idToken);
      const s = toSession(res);
      await saveSession(s);
      setSession(s);
    } catch (e) {
      // 서버가 주는 문구는 이미 존댓말이라 그대로 보여준다
      setError(isApiError(e) ? e.message : '로그인에 실패했습니다');
    } finally {
      setBusy(false);
    }
  }, []);

  const signOut = useCallback(async () => {
    setBusy(true);
    try {
      await signOutFromGoogle();
      await clearSession();
      setSession(null);
    } finally {
      setBusy(false);
    }
  }, []);

  return { session, loading, busy, error, signIn, signOut };
}
