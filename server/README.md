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

### 인증이 필요 없는 경로

`/health` · `/health/ready` · `/api/auth/**` 뿐이다. 나머지는 전부 토큰이 있어야 한다.

### 오류

| 상황 | 응답 |
| --- | --- |
| 토큰 없음 · 만료 · 위조 | `401` |
| 구글 토큰 검증 실패 | `401` `{"code":"invalid_token","message":"로그인에 실패했습니다"}` |

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
