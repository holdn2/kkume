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
├── server/               Spring Boot 4.1.x (Java 21)
└── docs/discussions/     계획·설계 문서 — git 미추적, 로컬 전용
```

import는 상대 경로 대신 별칭을 쓴다. `tsconfig.json`의 `paths`만으로 동작하며
`babel-plugin-module-resolver`는 필요 없다 (SDK 57의 Metro가 tsconfig를 읽는다).

```
@theme/token   @shared/ui/AppText   @components/Button   @features/record
@assets/...    @app/...
```

별칭은 위 여섯 개가 전부다. `@/*`(루트 전체)는 만들지 않는다 —
`@/theme`처럼 한 겹 더 들어가는 형태를 쓰지 않기로 했다.

**배럴은 바깥을 향한 문 하나다.** 화면은 `@components` · `@shared/ui`처럼
폴더째로 가져오고, **그 폴더 안에서는 배럴을 거치지 않는다** —
`Input.tsx`가 `Row`를 쓸 때는 `./layout`을 직접 부른다.
안쪽에서 배럴을 타면 `Input → index → layout → index` 같은 순환이 생기는데,
**RN에서 순환 참조는 에러가 아니라 `undefined`로 나타난다.**
렌더 중에 "Element type is invalid"만 뜨고 어느 줄이 원인인지 알려주지 않는다.

import는 **외부 패키지 / 별칭 / 상대 경로** 세 덩어리로 나누고 빈 줄로 띄운다.

계획 문서는 `docs/discussions/`에 HTML로 남기고 git에 올리지 않는다.
번호는 그 폴더 안에서 가장 큰 번호 + 1을 쓰고, 한 번 매기면 바꾸지 않는다.
**다른 워크트리에서 세션이 함께 돌고 있으면 파일을 만들기 직전에 폴더를 다시 본다** —
두 세션이 각자 번호를 매겨 같은 번호가 두 개 생긴 적이 있다(012). 나중에 만든 쪽이 양보한다.

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
8. **알림으로는 기록을 받지 않는다.** 진입점은 **잠금화면 위젯 하나**다
   (2026-09-01 사용자 결정 — *"고정 알림은 쓰지 않고 위젯으로만 하자"*).
   알림은 낮의 유도(LOG-3 확인 · 만화 완료)에만 쓴다.
   **이 결정이 유실 경로를 없앤다.** 위젯은 앱을 열고 앱이 그 자리에서 SQLite에 쓴다.

   되살릴 일이 생기면(예: 11주차 Android 진입점) 아래를 먼저 읽는다.
   iOS는 앱이 **종료 상태**면 알림 액션 응답으로 JS를 깨워주지 않는다.
   `addNotificationResponseReceivedListener`만 믿으면 새벽 기록이 통째로 사라지고,
   **새벽에 앱은 거의 항상 종료 상태다.** 앱이 시작할 때
   `getLastNotificationResponseAsync()`를 꺼내 그 자리에서 SQLite에 써야 하는데,
   **그것도 마지막 하나만 준다** — 종료 상태에서 두 번 기록하면 앞의 것은 못 꺼낸다.
   `registerTaskAsync`는 답이 아니다 — 알림 액션 탭으로 돌아가는 것은 **Android 전용**이다.
9. **위젯 함수 안에서는 모듈 스코프 변수를 쓰지 않는다.**
   `'widget'` 함수는 **문자열로 직렬화돼 격리된 JS 컨텍스트에서 평가된다.**
   그 안에는 import한 것과 `props` · `environment`만 있고 파일의 상수는 없다.
   참조하면 `ReferenceError`로 죽는데, **예외가 안 보이고 위젯이 조용히 빈 채로 뜨기 때문에**
   "딥링크가 안 된다"로 오진하기 딱 좋다. URL 같은 값은 위젯 안에 직접 박는다.
   같은 이유로 `reload()`만으로는 안 그려진다 — props가 없는 위젯이어도
   `updateSnapshot({})`을 최초 1회 불러야 한다.

10. **네이티브 모듈은 있는지 먼저 물어보고 쓴다.**
    `package.json`에 있는 것과 **지금 폰에 깔린 빌드에 들어 있는 것은 다르다.**
    `expo-haptics`·`expo-sqlite`·`expo-audio`가 전부 이 차이에서 물렸다.
    ```ts
    const HAS = requireOptionalNativeModule('ExpoSQLite') != null;
    ```
    **`try/catch`로 감싸는 것으로는 부족하다.** 모듈을 읽는 순간 던지고
    그 예외가 **콘솔에 빨간 ERROR로 남아** 검수하는 쪽에는 앱이 깨진 것처럼 보인다.
    없으면 **아예 부르지 않는다.**
    같은 인터페이스의 대체 구현(메모리 저장소 · 가짜 녹음기)을 두면
    네이티브가 붙기 전에도 화면과 흐름을 검증할 수 있다 — 빌드가 월 15회뿐이라
    빌드 한 번에 확인할 것을 쌓아 두지 않는 것이 중요하다.
    **비동기 실패도 잡아야 한다.** `impactAsync`처럼 Promise를 돌려주는 것은
    동기 `try/catch`에 안 걸리고 `Uncaught (in promise)`로 샌다.

## STT 결과는 `text` 하나에 쓴다 (2026-09-07 결정)

**컬럼을 나누지 않는다.** `stt_text` 같은 것을 두지 않고 기존 `text`에 이어 쓴다.
모바일 `dreams`와 서버 `V1__init.sql`이 둘 다 `text` + `stt_status`로 되어 있고,
**양쪽 마이그레이션을 맞추는 비용이 얻는 것보다 크다**는 판단이다.

이 질문이 지금 나온 이유가 있다. **되돌리기(음성↔적기)를 넣으면서
녹음과 텍스트를 둘 다 가진 기록이 처음 생겼다.** 계획서의 스키마는 그 전에 정해졌다.

형식은 이렇다.

```
사용자가 적기로 남긴 내용

[녹음 변환]
STT로 변환한 내용
```

- **덮어쓰지 않는다.** 사용자가 적은 것이 사라지면 절대 규칙 1이다
- **`[녹음 변환]`은 진짜 구분자다.** 재시도할 때 그 아래를 통째로 갈아 끼운다 —
  이어붙이면 `failed` 뒤 재시도마다 같은 문장이 하나씩 쌓인다
- **`stt_status`가 `done`이면 다시 쓰지 않는다.** 사용자가 변환 결과를 고쳐 뒀을 수 있다
- **음성만 있는 기록에는 마커를 붙이지 않는다**(사용자 결정 —
  *"음성만 남긴 것은 우선 붙이지 말아줘. 나중에 필요하다고 싶으면 다시 붙이면 되니까"*).
  위에 적은 글이 없으면 구분할 것이 없고, 마커가 항상 있으면
  대부분의 기록에 의미 없는 줄이 하나씩 붙는다
- **마커는 사용자 손 안에 있다.** 낮에 본문을 고치다 지우거나 옮길 수 있다.
  막을 방법이 없으므로 **파싱에 실패하면 맨 뒤에 붙이는 쪽으로 물러선다** —
  중복이 유실보다 낫다

## 기술 스택

**앱** — Expo SDK 57 · expo-router(NativeTabs) · TypeScript · StyleSheet + 토큰 ·
expo-sqlite · TanStack Query · Zustand · expo-widgets · expo-notifications ·
lucide-react-native · @shopify/flash-list · @gorhom/bottom-sheet ·
@storybook/react-native(온디바이스)

**서버** — Spring Boot 4.1.x (Java 21) · JPA · PostgreSQL · Flyway · S3 · Docker ·
소셜 로그인 토큰 검증만 (Spring Security 최소화)

계획서 10장은 3.x였지만 **start.spring.io가 더 이상 3.x를 주지 않는다.**
3.x의 마지막 3.5.16이 2026-06-25 이후 신규 릴리스가 없고, 4.0·4.1이 함께 패치되고 있어
현행 라인인 4.1을 쓴다. **Boot 4는 이름이 바뀐 것이 있다** —
`spring-boot-starter-web` → `spring-boot-starter-webmvc`,
`@WebMvcTest`는 `org.springframework.boot.webmvc.test.autoconfigure`.
3.x 예제를 그대로 붙여넣으면 컴파일되지 않으므로 **jar 안을 열어 확인한다.**

**인프라** — AWS EC2(t3.micro) + RDS + S3 · EAS Build

**EC2는 t3.micro이고 리전은 시드니(`ap-southeast-2`)다.**
계획서는 t3.small · 서울이었지만 둘 다 바꿨다.

- **t3.micro** — 무료 구간이 micro까지다. 1GiB뿐이라 스왑 2GB와 컨테이너 메모리 상한을 걸어 뒀다
- **시드니** — 배포 계정이 **무료 플랜**이라 한 리전에 묶여 있다.
  다른 리전은 조직 SCP가 **읽기까지** 거부한다.
  서울에서 `explicit deny in a service control policy`가 나오면 권한이 아니라 리전 문제다

자세한 것은 `server/deploy/README.md`에 있다.

단, **진입점(위젯 · 알림) 검증은 release 빌드로 한다.** dev client 빌드는
JS 번들을 Metro에서 받아오는데 **잠금 상태에서는 네트워크가 제한돼 앱이 그대로 죽는다.**
새벽 진입은 대부분 콜드 스타트라 이 차이가 결과를 뒤집는다.

## 빌드 예산 — 함부로 돌리지 않는다

EAS 무료 플랜을 쓴다. **iOS · Android 각각 월 15회**가 전부다.
12주 동안 진입점 검증 · 네이티브 모듈 추가 · 발표 시연용 빌드까지
이 안에서 해결해야 하므로, **빌드를 지르기 전에 멈춘다.**

### 재빌드가 필요한 경우는 이것뿐이다

- `app.json`의 플러그인 · 권한 · 번들 ID · entitlements 변경
- 새 네이티브 모듈 설치 (`expo install`로 들어오는 것 대부분)
- 위젯 · 컨트롤 등 네이티브 타겟 추가
- SDK 업그레이드

**그 밖은 전부 재빌드가 필요 없다.** 화면 · 컴포넌트 · 스타일 · 로직 ·
토큰 · 스토리북 스토리는 dev client + Metro로 즉시 반영된다.
"혹시 몰라서" 다시 빌드하지 않는다.

### JS만 바뀌었으면 빌드가 아니라 `eas update`다

2026-09-05 빌드부터 **`expo-updates`가 들어가 있다.** 그래서 실기기에 새 JS를 얹는 데
빌드가 필요 없다 — `preview` 프로필은 `preview` 채널을 본다.

```
cd mobile
$env:EXPO_PUBLIC_STORYBOOK_ENABLED = "false"
npm exec -- eas update --branch=preview --environment=preview --message "무엇을 바꿨는지"
```

**PowerShell 문법이고, 플래그 값은 등호로 붙인다.** `VAR=x cmd`는 bash 것이라
PowerShell에서는 파서 에러가 난다. 그리고 값을 띄어 쓰면 `npm exec`를 거치면서
떨어져 나가 `Unexpected argument`가 난다 — `eas update:list --branch preview`가
실제로 그렇게 실패했다(2026-09-06).

**환경변수를 손으로 붙여야 한다.** `EXPO_PUBLIC_STORYBOOK_ENABLED=false`는
`eas.json`의 **build 프로필 `env`**라 빌드에만 먹는다. `eas update`는 번들을
**로컬에서** 만들기 때문에 그 값을 물고 가지 않는다. 빼먹으면
`metro.config.js`의 기본값(`!== 'false'` → 켜짐)이 그대로 걸려서
**설치된 빌드에는 없는 스토리북이 들어간 번들**이 무선으로 나간다.
주석에 적힌 대로 번들이 2.4MB에서 7.1MB로 불어난다.
`--environment`도 `--non-interactive`에서는 필수다.

쏘고 나면 출력의 **`Runtime version`이 기기에 깔린 빌드의 `runtime.version`과
같은지 확인한다.** 다르면 그 기기에는 안 간다. 빌드 쪽 값은 이렇게 본다.

```
npm exec -- eas build:list --limit 1 --json --non-interactive
```

`runtime.version`과 `updateChannel.name`을 본다.

`runtimeVersion`은 **`fingerprint`** 정책이다. `appVersion`이 아니다 —
네이티브가 바뀌면 지문이 갈라져 **그 모듈이 없는 옛 빌드에는 새 JS가 아예 안 간다.**
`appVersion`으로 두면 `version`을 안 올린 채 네이티브를 추가했을 때
없는 모듈을 부르는 JS가 무선으로 배달된다. 이 저장소가 절대 규칙 10에서 겪은 실패와 같다.

EAS Update는 무료 플랜에 포함된다(MAU 1,000 · 대역폭 100 GiB, 2026-09-04 확인).

### 빌드 전에 반드시 돌리는 것

셋 다 로컬에서 끝나고, **실제로 빌드 실패를 잡아낸 적이 있다.**

```
npx expo config --type introspect    # 플러그인 · entitlements · Info.plist 결과물
npx expo export --platform ios       # JS 번들링 · 모듈 해석 오류
```

```
npx expo-doctor                      # 의존성 · 설정 스키마
```

**네이티브 설정을 건드렸으면 Docker로 `prebuild`까지 돌린다.** Windows에서는
`expo prebuild -p ios`가 막히지만 컨테이너에서는 3분이면 된다. 위젯 익스텐션이
Swift로 생성되는 데까지 확인할 수 있다 — EAS에서 가장 잘 깨지는 자리다.

```
git archive HEAD mobile | tar -x -C <임시폴더>
MSYS_NO_PATHCONV=1 docker run --rm -v "<임시폴더>:/app" -w /app node:22-bookworm   bash -lc 'npm install --legacy-peer-deps && npx expo prebuild --platform ios --no-install'
```

`ios/ExpoWidgetsTarget/RecordBoth.swift`가 만들어지면 통과다.
**Swift 컴파일과 CocoaPods만은 macOS 전용이라 EAS가 유일한 판정처다.**

`storybook.requires.ts`가 EAS에서만 없어 빌드가 깨지는 것을
`expo export`로 미리 잡았다. 그걸 몰랐으면 빌드 한 번을 날렸다.

### 모아서 한 번에

네이티브 변경이 여러 개 예상되면 **다 모은 뒤에 한 번 빌드한다.**
하나 넣고 빌드, 또 하나 넣고 빌드를 반복하면 월 할당이 금방 사라진다.

### 프로필 선택

- **`development`** — 평소 개발용. 한 번 깔면 JS 변경을 계속 받는다
- **`preview`** — 진입점 검증 전용. 잠금 상태 콜드 스타트는 이것으로만 판정된다

UI 라이브러리는 쓰지 않는다. 공용 컴포넌트 12개를 직접 만든다.
디자인이 강하게 커스텀이라 키트의 기본값을 거의 다 덮어쓰게 되기 때문이다.

## 참고

기존 RN 프로젝트 `D:\_Thip\Thip-Mobile`에서 재사용할 수 있는 것 —
Pretendard 로딩 훅, `AppText` 패턴, 카카오·구글 로그인 설정,
`expo-secure-store` 토큰 저장, axios 인스턴스.
특히 소셜 로그인은 네이티브 설정이 까다로운 구간이라 5주차에 시간을 크게 아낀다.
