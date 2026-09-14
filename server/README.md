# 꾸메 서버

Spring Boot 4.1 · Java 21 · PostgreSQL · Flyway.
배포 절차는 `deploy/README.md` 에 있다.

## 로컬에서 돌리기

```bash
./gradlew bootRun
```

**PostgreSQL 을 따로 띄우지 않아도 된다.** `spring-boot-docker-compose` 가 `compose.yaml` 을
읽어 컨테이너를 띄우고 접속 정보까지 넣어준다. Docker 만 켜져 있으면 된다.

```bash
./gradlew build      # 테스트 포함. Testcontainers 로 진짜 PostgreSQL 을 쓴다
```

## 앱이 쓰는 API

### 주소

```
https://13.239.58.251.nip.io
```

**앱은 이 주소를 쓴다.** iOS 가 평문 HTTP 를 막기 때문이다. `http://13.239.58.251` 도 아직 살아 있지만
모바일이 옮겨 가기 전까지만 둔다. 이 주소는 EC2 의 IP 에 묶여 있다 — 자세한 것은 `deploy/README.md` 의 HTTPS 절.


### 로그인

```http
POST /api/auth/google
Content-Type: application/json

{ "idToken": "<구글 네이티브 로그인으로 받은 ID token>" }
```

```json
{
  "accessToken": "eyJ...",
  "expiresIn": 2592000,
  "user": { "id": "9f1c...", "nickname": "잠꾸러기 3847" }
}
```

앱은 구글 로그인 라이브러리의 **`webClientId` 에 서버와 같은 client id** 를 넣어야 한다.
그 값이 ID token 의 `aud` 가 되고, 서버는 그것을 대조한다. 다르면 401 이다.

**가입과 로그인을 나누지 않는다.** 처음 온 사람은 그 자리에서 만들어지고
랜덤 닉네임이 붙는다. 앱에 회원가입 화면을 두지 않는다.

### 이후 모든 요청

```http
Authorization: Bearer <accessToken>
```

토큰 수명은 30일이다. 리프레시 토큰은 없다 — 만료되면 다시 구글 로그인을 하면 된다.
**수명을 길게 잡은 이유는 새벽이다.** 기록하려는데 로그인이 풀려 있으면 그 기록은 사라진다.

### 내 정보

```http
GET /api/me
```

```json
{ "id": "9f1c...", "nickname": "잠꾸러기 3847", "provider": "google", "createdAt": "2026-09-05T..." }
```

토큰이 아직 쓸 만한지 확인하는 데도 쓴다.

### 동기화

기기의 로컬 SQLite 와 서버를 맞춘다. **꿈 기록 행만 오간다** — 오디오 파일은
여기서 다루지 않는다(다음 이슈).

#### 받아가기

```http
GET /api/sync/dreams?since=2026-09-06T00:12:03.456789Z&cursor=m8x2k-a91f&limit=100
```

```json
{
  "dreams": [ { "id": "m8x2k-a91f", "title": "고래 꿈", "deletedAt": null, "updatedAt": "...", "clientUpdatedAt": "...", "...": "" } ],
  "nextSince": "2026-09-06T00:12:09.001122Z",
  "nextCursor": "m8x3p-b02c",
  "hasMore": false
}
```

`since` 없이 부르면 처음부터 전부 받는다. **기기를 바꾸거나 앱을 다시 깐 경우**가
여기에 해당한다. `hasMore` 가 `true` 면 `nextSince` 와 `nextCursor` 를 그대로 넣어
곧바로 한 번 더 부른다.

**둘을 함께 보내야 한다.** 시각만 보내면 같은 시각의 기록이 여럿일 때 페이지 경계에
걸린 한 건을 아무도 받아 가지 않는다.

**지워진 기록도 담겨 온다.** `deletedAt` 이 채워진 채로 온다 — 빼 버리면 기기가
삭제를 영영 모르고, 지운 기록이 다음 동기화에서 되살아난다.

#### 올리기

```http
POST /api/sync/dreams
{ "dreams": [ { "id": "m8x2k-a91f", "recordedAt": "...", "title": "고래 꿈",
               "text": "...", "durationMs": 1200, "reviewedAt": null,
               "deletedAt": null, "updatedAt": "..." } ] }
```

```json
{ "results": [
  { "id": "m8x2k-a91f", "status": "saved",    "reason": null },
  { "id": "m8x3p-b02c", "status": "skipped",  "reason": null },
  { "id": "m8x4q-c73d", "status": "rejected", "reason": "title_too_long" }
] }
```

| status | 뜻 | 기기가 할 일 |
| --- | --- | --- |
| `saved` | 반영됐다 | 올라감으로 표시한다 |
| `skipped` | 서버 것이 더 새롭다 | 받아가기로 서버 것을 가져간다 |
| `rejected` | 받을 수 없다 | **폰에 남긴다.** 고치기 전에는 다시 보내도 같다 |

거절 이유는 `missing_id` · `id_too_long` · `missing_recorded_at` ·
`missing_updated_at` · `title_too_long` · `not_owned` 다.

**한 건이 실패해도 나머지는 저장된다.** 전부 되돌리면 그 한 건을 고치기 전까지
오프라인에 쌓인 나머지가 영영 올라가지 못한다.

#### 정해 둔 규칙

| | |
| --- | --- |
| **충돌** | `updatedAt` 이 더 새로운 쪽이 이긴다. 같으면 서버를 유지한다 |
| **삭제** | 양쪽 다 소프트 삭제. 지워진 행도 응답에 담는다 |
| **배치** | 한 번에 **100건**. 넘으면 `400 too_many` — 기기가 나눠 보낸다 |
| **오디오** | 이 API 는 손대지 않는다. `audioUrl` 은 업로드 쪽에서만 바뀐다 |

**`updatedAt` 과 `clientUpdatedAt` 은 다른 시계다.** `updatedAt` 은 서버가 쓴 시각이라
커서가 이것을 따라가고, `clientUpdatedAt` 은 기기가 고친 시각이라 충돌 판정에만 쓴다.
하나로 합치면 시계가 느린 폰이 올릴 때 커서가 뒤로 가서, 다른 기기가 그 기록을 영영 못 받는다.

**서버가 기기의 값을 받지 않는 것들** — `audioUrl` · `sttStatus` · `userId`.
사용자는 토큰에서만 읽는다. 본문으로 받으면 남의 id 를 적어 넣는 순간 남의 기록에 닿는다.

### 인증이 필요 없는 경로

`/health` · `/health/ready` · `/api/auth/**` 뿐이다. 나머지는 전부 토큰이 있어야 한다.

### 오류

| 상황 | 응답 |
| --- | --- |
| 토큰 없음 · 만료 · 위조 | `401` |
| 구글 토큰 검증 실패 | `401` `{"code":"invalid_token","message":"로그인에 실패했습니다"}` |
| 한 번에 100건을 넘겨 올림 | `400` `{"code":"too_many", ...}` |

**왜 실패했는지 알려주지 않는다.** "서명이 틀렸다" 와 "대상이 틀렸다" 를 구분해 주면
토큰을 맞춰 보는 쪽에 힌트가 된다.

## 설정

| 키 | 환경변수 | 없으면 |
| --- | --- | --- |
| `kkume.auth.google.client-ids` | — | **기동하지 않는다.** 비어 있으면 다른 앱의 구글 토큰도 통과한다 |
| `kkume.auth.jwt.secret` | `KKUME_JWT_SECRET` | 임시 키를 만들고 경고한다. 재시작하면 로그인이 전부 풀린다 |
| 데이터소스 | `SPRING_DATASOURCE_URL` 등 | 로컬은 compose 가 채운다 |

**client id 는 앱에 박히는 공개 값**이라 저장소에 둔다. **client secret 은 쓰지 않는다.**
서명 키는 저장소에 두지 않는다 — 두면 그것을 읽은 누구나 남의 토큰을 위조할 수 있다.

## 애플 로그인을 붙일 때

`SocialTokenVerifier` 에 구현을 하나 더하고, `provider` CHECK 제약에 `'apple'` 을
더하는 마이그레이션을 쓰면 된다. 로그인 흐름과 토큰 발급은 그대로다.

## Spring Boot 4 에서 달라진 것

3.x 예제를 그대로 붙여넣으면 막히는 곳들이다.

| 3.x | 4.x |
| --- | --- |
| `spring-boot-starter-web` | `spring-boot-starter-webmvc` |
| `flyway-core` | `spring-boot-starter-flyway` |
| `spring-boot-starter-oauth2-resource-server` | `spring-boot-starter-security-oauth2-resource-server` |
| `@WebMvcTest` 어노테이션 패키지 | `org.springframework.boot.webmvc.test.autoconfigure` |
| Jackson 2 (`com.fasterxml.jackson.databind`) | **Jackson 3** (`tools.jackson.databind`) |
| Testcontainers `org.testcontainers.containers.PostgreSQLContainer<?>` | `org.testcontainers.postgresql.PostgreSQLContainer` — **제네릭이 아니다** |

**대칭키로 JWT 를 서명할 때는 알고리즘을 명시해야 한다.**
`JwtEncoderParameters.from(claims)` 만 쓰면 RS256 으로 서명하려다
`Failed to select a JWK signing key` 로 죽는다. 원인을 가리키지 않는 메시지다.

```java
JwsHeader header = JwsHeader.with(MacAlgorithm.HS256).build();
encoder.encode(JwtEncoderParameters.from(header, claims));
```
