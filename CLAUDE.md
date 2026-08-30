# 꾸메 — 꿈기록 커뮤니티

일어난 직후, 꿈이 사라지기 전에. 잠금화면에서 곧바로 기록하는 앱.
2026년 2학기 졸업프로젝트 · 1인 개발 · 12주.

## 저장소 구조

```
kkume/
├── mobile/               React Native (Expo SDK 57)
│   ├── app/              expo-router 라우트 — 여기가 라우팅의 뿌리다
│   ├── src/              theme · components · features · shared
│   └── assets/           폰트 · 이미지
├── server/               Spring Boot 3.x (Java 21)
└── docs/discussions/     계획·설계 문서 — git 미추적, 로컬 전용
```

import는 상대 경로 대신 별칭을 쓴다. `tsconfig.json`의 `paths`만으로 동작하며
`babel-plugin-module-resolver`는 필요 없다 (SDK 57의 Metro가 tsconfig를 읽는다).

```
@theme/token   @shared/ui/AppText   @components/Button   @features/record   @assets/...
```

계획 문서는 `docs/discussions/`에 HTML로 남기고 git에 올리지 않는다.
번호는 그 폴더 안에서 가장 큰 번호 + 1을 쓰고, 한 번 매기면 바꾸지 않는다.

| 문서 | 내용 |
|---|---|
| 001 | 계획서 — 기획 배경 · 결정 근거 · 12주 일정 |
| 003 | 화면 레이아웃 — 27개 화면 목업 |
| 004 | 컬러 팔레트 시안 — A~D 비교 (A 채택) |
| 005 | 디자인 시스템 — 토큰 · 컴포넌트 12개 · UI 레퍼런스 |
| 006 | 1주차 검증 체크리스트 |

## 네이밍 컨벤션

커밋 유형은 여섯 가지를 쓴다.

```
feature  fix  refactor  chore  style  docs
```

| 대상 | 형식 | 예시 |
|---|---|---|
| **이슈 제목** | `[커밋유형] 작업 내용` | `[Feature] 잠금화면 위젯 딥링크 진입 구현` |
| **PR 제목** | `[커밋유형/#이슈번호] 작업 내용` | `[Feature/#12] 잠금화면 위젯 딥링크 진입 구현` |
| **브랜치명** | `커밋유형/#이슈번호/작업내용` | `feature/#12/lockscreen-widget-deeplink` |
| **커밋 메시지** | `커밋유형: 작업 내용 (#이슈번호)` | `feature: 잠금화면 위젯 딥링크 진입 구현 (#12)` |

- **이슈·PR 제목의 커밋유형은 첫 글자를 대문자로** 쓴다 (`[Feature]`, `[Chore]`).
- **브랜치명과 커밋 메시지의 커밋유형은 소문자**로 쓴다.
- 브랜치의 작업 내용은 **영문 kebab-case**로 쓴다.

PR과 이슈 본문은 `.github/`의 템플릿 구조를 그대로 따른다.
섹션 제목·이모지·순서를 바꾸거나 빼지 않고, 해당 없는 섹션은 제목을 남긴 채
`해당 없음`이라고 적는다.

## 설계상 절대 규칙

문서를 다시 읽지 않아도 이것만은 지킨다.

1. **기록은 로컬 SQLite에 먼저 쓴다.** 서버 동기화는 그다음이다.
   새벽에는 네트워크가 없을 수 있고, 기록 유실은 이 앱에서 유일하게 용납되지 않는 실패다.
2. **원본 오디오를 반드시 함께 보관한다.** STT가 틀려도 복원할 수 있어야 한다.
3. **`record-modal`은 `(tabs)` 바깥에 둔다.** 탭바가 보이면 새벽에 결정을 유발한다.
4. **hex는 `src/theme/token.ts`에만 쓴다.** 다른 파일에서 `#`이 보이면 잘못된 것이다.
   **예외는 `app.json` 하나다** — 스플래시 배경과 Android 아이콘 배경은 네이티브 설정이라
   TS를 import할 수 없다. `app.config.ts`로 바꾸면 토큰을 쓸 수 있지만,
   **EAS가 위젯·컨트롤 익스텐션의 `appExtensions` 블록을 `.ts` 설정에는 써 넣지 못한다.**
   그 자동 삽입이 익스텐션 크레덴셜을 성립시키므로 `app.json`을 유지한다.
5. **청록(`c.running`)은 "진행 중"에만 쓴다.** 녹음 중 · 생성 중 · 미확인 기록.
   그 밖에 쓰면 새벽에 색으로 상태를 판단할 수 없게 된다.
6. **AI 호출은 반드시 서버를 거친다.** 앱에 API 키를 넣지 않는다.
7. **새벽 화면에서 사용자가 내리는 결정은 0개다.** 모드 선택 · 저장 확인 · 제목 입력을
   새벽 흐름에 넣지 않는다. 온보딩(낮)으로 앞당기거나 확인 화면(낮)으로 미룬다.
8. **알림 응답은 앱 시작 시점에 반드시 회수한다.**
   iOS는 앱이 **종료 상태**면 알림 액션 응답으로 JS를 깨워주지 않는다.
   `addNotificationResponseReceivedListener`만 믿으면 새벽 기록이 통째로 사라지고,
   **새벽에 앱은 거의 항상 종료 상태다.**
   앱이 시작할 때 `getLastNotificationResponseAsync()`를 꺼내 그 자리에서 SQLite에 쓴다.
   `registerTaskAsync`는 답이 아니다 — 알림 액션 탭으로 돌아가는 것은 **Android 전용**이다.
9. **위젯 함수 안에서는 모듈 스코프 변수를 쓰지 않는다.**
   `'widget'` 함수는 **문자열로 직렬화돼 격리된 JS 컨텍스트에서 평가된다.**
   그 안에는 import한 것과 `props` · `environment`만 있고 파일의 상수는 없다.
   참조하면 `ReferenceError`로 죽는데, **예외가 안 보이고 위젯이 조용히 빈 채로 뜨기 때문에**
   "딥링크가 안 된다"로 오진하기 딱 좋다. URL 같은 값은 위젯 안에 직접 박는다.
   같은 이유로 `reload()`만으로는 안 그려진다 — props가 없는 위젯이어도
   `updateSnapshot({})`을 최초 1회 불러야 한다.

## 기술 스택

**앱** — Expo SDK 57 · expo-router(NativeTabs) · TypeScript · StyleSheet + 토큰 ·
expo-sqlite · TanStack Query · Zustand · expo-widgets · expo-notifications ·
lucide-react-native · @shopify/flash-list · @gorhom/bottom-sheet ·
@storybook/react-native(온디바이스)

**서버** — Spring Boot 3.x · JPA · PostgreSQL · Flyway · S3 · Docker ·
소셜 로그인 토큰 검증만 (Spring Security 최소화)

**인프라** — AWS EC2 + RDS + S3 · EAS Build

단, **진입점(위젯 · 알림) 검증은 release 빌드로 한다.** dev client 빌드는
JS 번들을 Metro에서 받아오는데 **잠금 상태에서는 네트워크가 제한돼 앱이 그대로 죽는다.**
새벽 진입은 대부분 콜드 스타트라 이 차이가 결과를 뒤집는다.

UI 라이브러리는 쓰지 않는다. 공용 컴포넌트 12개를 직접 만든다.
디자인이 강하게 커스텀이라 키트의 기본값을 거의 다 덮어쓰게 되기 때문이다.

## 참고

기존 RN 프로젝트 `D:\_Thip\Thip-Mobile`에서 재사용할 수 있는 것 —
Pretendard 로딩 훅, `AppText` 패턴, 카카오·구글 로그인 설정,
`expo-secure-store` 토큰 저장, axios 인스턴스.
특히 소셜 로그인은 네이티브 설정이 까다로운 구간이라 5주차에 시간을 크게 아낀다.
