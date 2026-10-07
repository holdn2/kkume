/**
 * 가입 동의(이슈 #71). 화면 없이 규칙만 — 언제 동의 시트를 띄우는가, 언제 「동의하고 계속」이 눌리는가.
 * 구현보다 먼저 넣었다.
 */
import { CONSENT_ITEMS, CONSENT_VERSION, canAgree, needsConsent, recordConsent } from '@features/consent/logic';

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

console.log(`\n${total}개 중 실패 ${failed}개`);
if (failed) process.exitCode = 1;
