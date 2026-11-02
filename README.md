# 꾸메 — 꿈이 사라지기 전에

일어난 직후, 꿈이 사라지기 전에 **잠금화면 위젯에서 곧바로** 기록하는 앱.
2026년 2학기 졸업프로젝트 · 1인 개발 · 12주 · iOS.

꿈은 깬 뒤 몇 분 안에 빠르게 잊힌다. 그런데 메모장까지 가는 길은 **폰 집기 → 앱 찾기 → 앱 열기 → 새 메모**로 길다.
꾸메는 이 길을 **폰 집기 → 잠금화면 위젯 누르기** 두 단계로 줄인다. 누르는 순간 녹음이 시작되고, 새벽 화면에서는
아무것도 고르게 하지 않는다. 기록은 폰에 먼저 쓰고 서버 동기화는 그다음이다.

| 축 | 하는 일 |
|---|---|
| **꿈 기록** | 잠금화면 위젯 → 바로 녹음(기기에서 받아쓰기) 또는 적기. 원본 녹음을 함께 보관한다 |
| **꿈 로그** | 남긴 꿈을 다시 보고 고치고 찾는다. 낮에 확인 알림 |
| **꿈 만화** | 꿈을 네 컷 만화로 그린다(Cloudflare Workers AI, 서버를 거침) |
| **꿈 나눔** | 꿈을 익명 닉네임으로 나누고 해몽 댓글 · 공감. 신고 · 차단 · 자동 가림 |

## 저장소

```
kkume/
├── mobile/   React Native · Expo SDK 57 · expo-router · TypeScript   → mobile/README.md
├── server/   Spring Boot 4.1 · Java 21 · PostgreSQL · Flyway           → server/README.md
└── site/     이용약관 · 개인정보처리방침(GitHub Pages)
```

## 돌리기 · 테스트

```bash
# 모바일 — 개발 빌드(dev client)가 깔린 아이폰에서
cd mobile
npm ci --legacy-peer-deps
npm start

npx tsc --noEmit
npx eslint app src
node scripts/test-all.mjs      # 로직 · 동기화 · 계약 테스트 11종(Node에서, 기기 없이)

# 서버 — Docker만 켜져 있으면 PostgreSQL은 알아서 뜬다
cd server
./gradlew bootRun
./gradlew test                 # Testcontainers로 진짜 PostgreSQL을 띄운다
```

PR마다 `.github/workflows/ci.yml`이 위 검사를 돈다. 잠금화면 위젯 → 녹음 같은 **네이티브 진입 경로는 Node 테스트로
재현되지 않아** 실기기 확인표로 검증한다.

## 설계에서 지킨 것

1. **기록은 폰(SQLite)에 먼저 쓴다.** 새벽에는 네트워크가 없을 수 있고, 기록 유실은 이 앱에서 유일하게 용납되지 않는 실패다.
2. **원본 녹음을 함께 보관한다.** 받아쓰기가 틀려도 되돌릴 수 있게.
3. **새벽 화면에서 사용자가 내리는 결정은 0개다.** 모드 선택 · 저장 확인 · 제목 입력을 새벽 흐름에 넣지 않는다.
4. **진입점은 잠금화면 위젯 하나다.** iOS는 종료된 앱을 알림 응답으로 깨워 주지 않아, 알림으로 기록을 받으면 새벽 기록이 사라진다.
5. **AI 호출은 서버를 거친다.** 앱에 키를 넣지 않고, 만화는 하루 한도와 실제 원가(`comic_costs`)를 서버가 관리한다.

작업 규칙과 결정의 이유는 `CLAUDE.md`(개발 지침), `server/README.md` · `server/deploy/README.md`(서버 · 배포)에 있다.
