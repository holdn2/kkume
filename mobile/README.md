# 꾸메 모바일

Expo SDK 57 · expo-router(NativeTabs) · TypeScript · expo-sqlite · TanStack Query · expo-widgets.
전체 소개는 저장소 루트 `README.md`, 작업 규칙은 `CLAUDE.md`.

## 구조

```
app/          expo-router 라우트 — 라우팅의 뿌리
  (tabs)/     꿈 로그 · 빠른기록 · 꿈 나눔 · 마이
  record.tsx  잠금화면 위젯이 여는 새벽 기록 화면 — 탭 바깥에 둔다
src/
  theme/      토큰(색 · 간격 · 글자). hex는 여기에만 쓴다
  components/ 공용 컴포넌트
  features/   화면 단위 기능(log · record · comic · community · onboarding · widget(잠금화면 위젯) …)
  shared/     db(SQLite) · sync · api · auth · audio · dictation
scripts/      Node에서 도는 테스트 실행기(기기 없이)
```

import는 별칭을 쓴다: `@theme/token` · `@shared/…` · `@components` · `@features/…` · `@assets/…` · `@app/…`.

## 개발

```bash
npm ci --legacy-peer-deps
npm start                     # 개발 빌드(dev client)가 깔린 기기에서 연다
npx tsc --noEmit
npx eslint app src
node scripts/test-all.mjs     # 11종 전부 · `node scripts/test-all.mjs comic`처럼 골라서
```

- **JS만 바뀌었으면 빌드가 아니라 `eas update`(OTA)다.** 네이티브 모듈 · `app.json` · `package.json`의 `scripts`를
  바꾸면 런타임 지문이 갈라져 설치된 빌드로 OTA가 가지 않는다 — 내기 전에
  `npm exec -- expo-updates fingerprint:generate --platform ios`로 잰다. 자세한 절차는 `CLAUDE.md`의 「빌드 예산」.
- 스토리북은 기기 안(마이 탭 「스토리북 열기」)에서 본다. `.rnstorybook/storybook.requires.ts`는
  `npm run storybook:generate`로 만든다(git에 없다).
