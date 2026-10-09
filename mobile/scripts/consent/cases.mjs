/**
 * 가입 동의(이슈 #71). 화면 없이 규칙만 — 언제 동의 시트를 띄우는가, 언제 「동의하고 계속」이 눌리는가.
 * 구현보다 먼저 넣었다.
 */
import { CONSENT_ITEMS, CONSENT_VERSION, canAgree, canSync, consentAction, needsConsent, recordConsent } from '@features/consent/logic';
import { clearSession, saveSession } from '@shared/auth/session';
import { getDreamRepo, SETTINGS } from '@shared/db';
import { syncIfSignedIn } from '@shared/sync';

let failed = 0;
let total = 0;
const check = (key, name, ok, detail = '') => {
  total += 1;
  if (!ok) failed += 1;
  console.log(`${key}  ${ok ? '정상' : '실패'} ${name}${detail ? ` — ${detail}` : ''}`);
};

check('K1', '동의한 적이 없으면 띄운다', needsConsent(null) === true);
check('K2', '깨진 값이어도 띄운다(다시 받는다)', needsConsent('{oops') === true && needsConsent('"x"') === true);
const now = recordConsent(new Date('2026-10-07T00:00:00Z'));
check('K3', '지금 버전에 동의했으면 띄우지 않는다', needsConsent(now) === false, now);
check('K4', '예전 버전에 동의했으면 다시 띄운다(문서가 바뀌면 다시 받음)', needsConsent(JSON.stringify({ version: '2000-01-01', at: '2000-01-01T00:00:00Z' })) === true);
check('K5', '기록에는 버전과 시각이 남는다', JSON.parse(now).version === CONSENT_VERSION && JSON.parse(now).at === '2026-10-07T00:00:00.000Z');

const all = Object.fromEntries(CONSENT_ITEMS.map((i) => [i.key, true]));
check('K6', '필수 항목은 셋 — 만 14세 이상 · 이용약관 · 개인정보', CONSENT_ITEMS.length === 3 && CONSENT_ITEMS.every((i) => i.required));
check('K7', '셋 다 체크해야 동의할 수 있다', canAgree(all) === true);
for (const item of CONSENT_ITEMS) {
  const one = { ...all, [item.key]: false };
  check(`K8·${item.key}`, `${item.label}이 빠지면 못 한다`, canAgree(one) === false);
}
check('K9', '아무것도 안 했으면 못 한다', canAgree({}) === false);

// 로그인한 채 마이 탭을 열 때(계약 072) — 서버 값을 믿는다
const old = JSON.stringify({ version: '2000-01-01', at: '2000-01-01T00:00:00Z' });
check('K10', '서버가 이번 버전이라 하면 폰 기록이 없어도 묻지 않는다(다른 기기에서 동의)', consentAction(null, CONSENT_VERSION) === 'skip');
check('K11', '폰에서 동의했는데 서버에 없으면 묻지 않고 올린다', consentAction(now, null) === 'upload' && consentAction(now, '2000-01-01') === 'upload');
check('K12', '폰에도 서버에도 없으면 묻는다', consentAction(null, null) === 'ask' && consentAction(old, '2000-01-01') === 'ask');
check('K13', '서버 값을 모르면(오프라인 · 옛 서버) 폰 기록으로 정한다', consentAction(now, undefined) === 'skip' && consentAction(null, undefined) === 'ask');
check('K14', '동의가 어디에도 없으면 동기화하지 않는다(이미 있는 계정의 첫 로그인)', canSync(null, null) === false && canSync(old, '2000-01-01') === false);
check('K15', '서버나 폰에 이번 동의가 있으면 동기화한다', canSync(null, CONSENT_VERSION) === true && canSync(now, null) === true);
check('K16', '필드가 없는 옛 세션은 막지 않는다', canSync(null, undefined) === true);

// 동기화 입구에서 실제로 막히는가(PR #83 리뷰) — 서버로 나가는 요청을 센다
{
  const realFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return new Response(JSON.stringify({ dreams: [], cursor: null, hasMore: false, results: [] }), { status: 200 });
  };
  const session = (consentVersion) => ({
    accessToken: 't',
    expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    user: { id: 'u-me', nickname: '나 0001', consentVersion },
  });
  await (await getDreamRepo()).setSetting(SETTINGS.consent, '');
  await saveSession(session(null));
  const blocked = await syncIfSignedIn({ force: true });
  check('K17', '동의 없는 기존 계정이 로그인하면 서버로 아무것도 보내지 않는다', blocked === null && calls === 0, `요청 ${calls}회`);
  await saveSession(session(CONSENT_VERSION));
  await syncIfSignedIn({ force: true }).catch(() => null);
  check('K18', '동의가 있으면 그대로 동기화한다', calls > 0, `요청 ${calls}회`);
  globalThis.fetch = realFetch;
  await clearSession();
}

console.log(`\n${total}개 중 실패 ${failed}개`);
if (failed) process.exitCode = 1;
