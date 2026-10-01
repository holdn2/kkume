import { useState } from 'react';

import { Button, Input, Sheet, Stack } from '@components';
import { NICKNAME_MAX, NICKNAME_MIN, type Author } from '@shared/api/community';
import { loadSession, saveSession } from '@shared/auth/session';
import { AppText } from '@shared/ui';
import { c, sp } from '@theme/token';

import { getCommunityApi } from './api';
import { nicknameProblem } from './logic';
import { useInvalidateCommunity } from './queries';

type Props = {
  visible: boolean;
  onClose: () => void;
  /** 시트를 열 때 칸에 채워 둘 지금 닉네임 */
  current: string;
  /** 바꾼 뒤. 세션 · 커뮤니티 캐시는 여기 오기 전에 이미 새로 고쳐져 있다 */
  onSaved?: (me: Author) => void;
};

/**
 * 닉네임 바꾸기 시트. 프로필(COM-4)과 마이 탭(이슈 #63)이 함께 쓴다.
 *
 * 서버(`PATCH /api/me`, 056 04장 4)에 보내고, 성공하면 **폰의 세션 닉네임**과 **커뮤니티 캐시**를 함께 고친다 —
 * 세션은 마이 탭 · "○○(으)로 올라갑니다"가 읽고, 닉네임은 글에 복사하지 않아 피드 · 댓글의 이름도 바뀐다.
 * 열 때마다 지금 닉네임으로 다시 채운다(부모가 `key`를 바꾸지 않아도 되게 안에서 맞춘다).
 */
export function NicknameSheet({ visible, onClose, current, onSaved }: Props) {
  const invalidate = useInvalidateCommunity();
  const [value, setValue] = useState(current);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [wasVisible, setWasVisible] = useState(visible);

  // 열리는 순간 지금 닉네임으로 채운다. effect 가 아니라 렌더에서 — 한 프레임 옛 값이 보이지 않게
  if (wasVisible !== visible) {
    setWasVisible(visible);
    if (visible) {
      setValue(current);
      setError(null);
    }
  }

  const problem = nicknameProblem(value);
  const unchanged = value.trim() === current;

  const save = () => {
    if (problem || unchanged || saving) return;
    setSaving(true);
    getCommunityApi()
      .setNickname(value.trim())
      .then(async (me) => {
        const s = await loadSession();
        if (s) await saveSession({ ...s, user: { ...s.user, nickname: me.nickname } });
        void invalidate();
        onSaved?.(me);
        onClose();
      })
      .catch((e) => setError(e?.message ?? '바꾸지 못했습니다'))
      .finally(() => setSaving(false));
  };

  return (
    <Sheet visible={visible} onClose={onClose} title="닉네임 바꾸기">
      <Stack gap={sp[3]}>
        <Input
          value={value}
          onChangeText={(v) => {
            setValue(v);
            setError(null);
          }}
          maxLength={NICKNAME_MAX}
          counter
          autoFocus
          onSubmitEditing={save}
          // 입력 중에는 길이만 센다. 규칙 위반 문구는 짧을 때가 아니라 보낼 수 없는 문자가 있을 때만
          error={error ?? (value.trim().length >= NICKNAME_MIN && problem ? problem : undefined)}
        />
        <AppText size="caption" color={c.fgFaint}>
          {NICKNAME_MIN}~{NICKNAME_MAX}자. 바꾸면 지난 글과 댓글의 이름도 새 이름으로 보입니다.
        </AppText>
        <Button label={saving ? '바꾸는 중' : '바꾸기'} disabled={!!problem || unchanged || saving} onPress={save} />
      </Stack>
    </Sheet>
  );
}
