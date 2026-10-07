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

**앱은 이 주소를 쓴다.** iOS 가 평문 HTTP 를 막기 때문이다. 옛 `http://13.239.58.251` 은
모바일이 옮겨 간 뒤 닫았다(2026-09-17). 이 주소는 EC2 의 IP 에 묶여 있다 — 자세한 것은 `deploy/README.md` 의 HTTPS 절.


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

### 가입 동의

`PUT /api/me/consent` `{ "version": "2026-10-07" }` → `204`. 계약은 문서 070 · 072(모바일 071에서 수용).

- 버전은 공개 문서 시행일 모양(`YYYY-MM-DD`)이고 뜻은 따지지 않는다. 아니면 `400 invalid_consent_version`
- **같은 버전을 다시 보내도 처음 동의한 시각을 덮지 않는다.** 더 옛 버전이 오면 내리지 않는다
- **로그인 요청에도 받는다** — `POST /api/auth/google { idToken, consentVersion? }`. 계정을 찾거나 만드는 같은 트랜잭션에서 기록하고,
  버전 모양은 구글 토큰보다 먼저 본다(틀리면 계정을 만들지 않는다)
- **동의 없이는 계정을 만들지 않는다**(문서 074). 꾸메 계정이 없는 구글 계정이 `consentVersion` 없이 오면 `403 consent_required` —
  계정 · 설정 행 · 닉네임 어느 것도 쓰지 않는다. 앱은 계정을 고른 뒤에 이걸 받고 동의 시트를 띄워, **같은 ID 토큰**에 동의를 붙여 다시 보낸다
  (구글 토큰은 만료 전이면 다시 받는다 — 재사용을 막지 않는다). 판정 순서는 버전 모양(400) → 구글 토큰(401) → 계정 없음 + 동의 없음(403)이라,
  "이 구글 계정은 꾸메 계정이 없다"는 사실은 토큰 주인에게만 나간다. 이미 있는 계정은 동의가 없거나 옛 버전이어도 로그인시킨다
  (앱이 로그인 뒤에 묻고 `PUT /api/me/consent`). 지운 계정은 찾히지 않으므로 다시 가입하는 것과 같다. 판정은 `UserService.findOrCreate`에 있어
  다른 소셜 로그인(애플 #72)도 같은 규칙을 탄다
- 로그인 응답 `user` 와 `GET /api/me` 에 `consentVersion`(없으면 `null`). 계정을 지우면 비운다

### 이용 정지 · 신고 알림

운영자가 `server/deploy/moderate.sh suspend <userId>` 로 막은 계정은 **글 · 댓글 · 공감 · 닉네임 바꾸기만** `403 account_suspended`
(`이용이 제한된 계정입니다. 문의: <kkume.moderation.contact>`). 신고 · 차단 · 읽기 · 내 꿈 동기화 · 동의 · 계정 삭제는 된다 —
비공개 꿈 기록은 커뮤니티 위반과 무관하다. 이 검사는 `AccountGuard.lockWritable` 이다(남에게 보이는 것을 만드는 쓰기만).

신고가 새로 들어오면(같은 사람의 같은 대상 재신고는 빼고) **커밋된 뒤에, 요청과 따로** SNS 로 운영자 메일을 보낸다(`ReportAlerts`).
메일이 실패해도 신고는 `204`. 메일에는 종류 · id · 정해진 사유 · 신고 수만 담고 **이용자가 쓴 글자는 넣지 않는다.**
`kkume.moderation.topic-arn` 이 비어 있으면(로컬 · 테스트) 보내지 않는다.

### 계정 삭제

`DELETE /api/me` → `204`. 계약은 문서 064 · 066(모바일 065에서 수용)이다. **폰의 기록은 남고 서버의 기록은 지운다.**
유예 없이 그 자리에서 지운다 — 다시 로그인하면 새 계정이라 유예 동안 되살릴 길이 없고, 원본은 폰에 있다.

| 무엇 | 어떻게 |
| --- | --- |
| 꿈 기록 · 변환 작업 · 설정 · S3 `audio/{userId}/` | 실제로 지운다 |
| 동의 기록 · 이용 정지 기록 | 비운다(072) |
| 내 글 · 댓글 | "지운 것" + 내용을 비운다. 남의 댓글 · 공감 · 신고가 가리켜서 행은 남긴다 |
| 내 공감 · 차단(양방향) | 지운다. 공감 수는 다시 센다 |
| 신고 | 남긴다 — 이미 가려진 것이 풀리지 않게 |
| 사용자 행 | 남기고 익명화 — `provider_id = deleted:<UUID>`, 닉네임 `탈퇴한 사용자` |

- **`provider_id`를 바꾸지 않으면 같은 구글 계정으로 로그인할 때 지운 계정이 되살아난다.** 바꾸면 새 계정이 되고, 폰이 같은 꿈 id 로
  다시 올려도 꿈을 실제로 지웠으므로 새 계정의 기록으로 들어간다
- **S3 를 먼저, DB 를 나중에.** S3 에서 실패하면 아무것도 안 지우고 `503 deletion_failed`. DB 뒤에 S3 를 한 번 더 지우고,
  10분마다 지난 24시간 안에 지운 계정의 녹음을 다시 쓸어 낸다 — 삭제 전에 받은 업로드 URL(15분)로 삭제 뒤에 올라온 것 때문이다
- **지운 계정의 토큰은 모든 경로에서 `401 account_deleted`** — 매 요청 `users.deleted_at` 을 본다(`SecurityConfig`). 앱은 이것을 성공처럼 마무리한다
- **모든 쓰기는 맨 처음 `AccountGuard.lockActive` 를 부른다**(사용자 행 `FOR SHARE`). 토큰 검사는 요청 시작 한 번뿐이라,
  삭제와 겹친 쓰기가 삭제 뒤에 커밋하면 꿈이 되살아나고 익명화한 닉네임이 덮인다. 삭제는 같은 행을 `FOR UPDATE` 로 잡아 줄을 세운다.
  **새 쓰기 경로를 만들면 이것을 빠뜨리지 않는다**
- 닉네임 `탈퇴한 사용자`는 공백을 무시하고 비교해 쓸 수 없다(`400 nickname_invalid`)

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
| **오디오** | 이 API 는 손대지 않는다. `audioUrl` 은 업로드 쪽에서만 바뀐다(아래 "오디오와 변환") |

**`updatedAt` 과 `clientUpdatedAt` 은 다른 시계다.** `updatedAt` 은 서버가 쓴 시각이라
커서가 이것을 따라가고, `clientUpdatedAt` 은 기기가 고친 시각이라 충돌 판정에만 쓴다.
하나로 합치면 시계가 느린 폰이 올릴 때 커서가 뒤로 가서, 다른 기기가 그 기록을 영영 못 받는다.

**서버가 기기의 값을 받지 않는 것들** — `audioUrl` · `sttStatus` · `userId`.
사용자는 토큰에서만 읽는다. 본문으로 받으면 남의 id 를 적어 넣는 순간 남의 기록에 닿는다.

**본문(`text`)에 길이 제한이 없다.** 앱은 키보드 입력만 5,000자로 막고, 변환 결과를 합칠 때는
자르지 않는다(문서 040). 서버는 길이로 거절하지 않는다.

### 오디오와 변환

**2026-09-24부터 받아쓰기는 기기가 녹음하면서 한다(문서 048).** 녹음은 사용자가 받아쓴 글과
대조해 보는 사본으로만 올라온다. 그래서 **④는 변환 작업을 만들지 않는다**(`kkume.stt.enqueue=false`) —
⑤ · ⑦ · 재시도는 서버 변환을 예비로 켜는 날(한국어 모델이 없는 폰 · Android)을 위해 남겨 둔 경로다.
그 전의 계약은 문서 039(모바일 040에서 그대로 수용)다.

```
① 기록 행을 동기화로 올린다                   (위의 "동기화")
② POST /api/dreams/{id}/audio/upload {format?} → { uploadUrl, method, headers, key, expiresAt }
③ 앱이 uploadUrl 에 파일을 PUT               (headers 를 그대로 붙인다)
④ POST /api/dreams/{id}/audio/complete {key} → { sttStatus: "pending" }
⑤ 서버가 변환                                 (끝나면 기록의 updated_at 이 올라 받기에 다시 내려온다)
⑦ GET  /api/dreams/{id}/stt                  → { status, text, error, attempts, updatedAt }
   POST /api/dreams/{id}/stt/retry           → failed 일 때만 pending 으로
```

**서버는 `text` 와 `clientUpdatedAt` 을 쓰지 않는다.** 변환 원문은 ⑦의 `text` 로만 주고,
앱이 `[녹음 변환]` 규칙대로 로컬 `text` 에 합쳐 평소처럼 올린다. 서버가 `text` 에 쓰면
변환 도중 사용자가 고친 글과 부딪혀 둘 중 하나가 사라진다(039 C1).
서버가 기록에 쓰는 것은 `audio_url` · `stt_status` · `updated_at` 뿐이다.

- **①이 ②보다 먼저다.** 서버에 없는 기록에는 업로드 자리를 주지 않는다
- **②의 `format` 은 `"m4a"`(기본) · `"wav"`.** 본문이 없으면 m4a 다 — 형식을 보내지 않던 앱이 그대로 동작한다.
  받아쓰기 녹음은 WAV 로만 남으므로(인식 라이브러리가 WAV 만 쓴다) `"wav"` 를 보낸다. 서명의 `Content-Type` 이
  `audio/mp4` · `audio/wav` 로, 키의 확장자가 `.m4a` · `.wav` 로 따라간다
- **②의 `headers` 를 그대로 붙여 PUT 한다.** `Content-Type` 이 서명에 들어가 있어 다르면 S3 가 403 으로 거절한다. URL 은 15분짜리다
- **④는 두 번 보내도 된다.** 응답이 유실돼 다시 보내면 같은 결과를 준다
- **`audioUrl` 은 URL 이 아니다.** `s3://…` 모양의 저장 위치다. 앱은 `null` 인지만 본다
- **`sttStatus` 는 `audioUrl` 이 있을 때만 뜻이 있다.** 음성 없는 기록도 기본값이 `pending` 이다
- **⑦의 원문은 서버에 남는다.** 합치기 전에 폰을 잃어도 새 폰에서 다시 받는다
- 서버는 실패하면 스스로 3번까지 다시 시도하고, 그 동안 ⑦은 `pending` 이다. 파일 한도 25MB · 자동 재시도 3번은 **가안**이다.
  25MB 는 m4a(128kbps)로 약 26분, WAV(16kHz · 16bit · mono)로 약 13분이다
- **올린 뒤 지운 기록은 변환하지 않는다.** 작업은 줄에 그대로 남고, 앱이 되살리면(`deletedAt: null` 로 올리면)
  그때 잡혀 변환된다. S3 의 파일도 남는다 — 앱이 "나중에 되살릴 수 있다"고 안내하는 경로라서다.
  변환 도중에 지운 것은 끝까지 간다(이미 쓴 비용이다). 변환 서비스를 붙이는 날 쌓인 작업을 돌릴 때도 같다

| 응답 | 언제 | 앱이 할 일 |
| --- | --- | --- |
| `404 dream_not_found` | 서버에 그 기록이 없음 — 동기화 전이거나 남의 기록 | 다음 동기화 뒤에 다시 |
| `409 recording_unfinished` | 서버의 `durationMs` 가 비어 있음 | 올리지 않는다 |
| `409 dream_deleted` | 지운 기록 — ② · ④ · 재시도 모두 | 올리지 않는다 |
| `409 audio_exists` | 이미 다른 파일로 끝난 기록 | 올라간 것으로 본다 |
| `400 unsupported_format` | ②의 `format` 이 `m4a` · `wav` 가 아님 | 앱 버그 |
| `400 key_mismatch` | ④의 `key` 가 이 기록의 것이 아님 | 앱 버그 |
| `422 upload_missing` | ④를 받았는데 파일이 없음 | ②부터 다시 |
| `413 audio_too_large` | 25MB 초과. 서버가 지운다 | 다시 보내도 같다. 폰 원본은 남는다 |
| `404 no_audio` | ⑦ · 재시도인데 올라간 오디오가 없음 | STT 대상이 아니다 |
| `409 already_done` | 끝난 변환을 다시 하라고 함 | 하지 않는다 |
| `503 audio_unavailable` | 버킷이 설정되지 않은 서버(로컬 등) | — |

`404 dream_not_found` 는 남의 기록에도 같은 답을 준다. 동기화의 `not_owned` 와 일부러 다르다 —
여기는 기록 하나를 경로로 가리키는 자리라, 구분해 주면 그 id 가 있는지 떠볼 수 있다.

### 커뮤니티 — 꿈 나눔

계약은 문서 056(모바일 057에서 수용, 2026-09-30 확정)이다. 모양 · 오류 코드 전부가 거기 있고, 여기에는 코드만 봐서는
다시 떠올리기 어려운 규칙만 적는다.

- **글은 꿈의 복사본이다.** 앱이 보낸 제목 · 꿈 내용(사용자가 올리기 전에 고친 값)을 저장하고 `dreams` 는 소유 확인에만 본다.
  그래서 `posts.dream_id` 에 외래 키가 없다. 녹음은 올리지 않는다
- **꿈 하나에 글 하나** — 부분 유니크 인덱스(`deleted_at IS NULL`)가 지킨다. 가려진 글도 센다. 겹치면 `409 already_shared` + `postId`
- **`GET /api/community/dreams/{dreamId}/post`** 는 없는 꿈 · 남의 꿈에도 `200 { postId: null }` 이다(묻는 것이 "내 글"이라)
- **서로 다른 3명이 신고하면 가린다.** 가린 글은 작성자에게만 `hidden: true` 로 보이고, 공감 · 댓글은 작성자여도 받지 않는다. 풀리지 않는다
- **차단은 서버에 있고 피드와 댓글에서만 거른다.** 프로필 · 사용자 글 · 글 상세는 일부러 들어온 자리라 거르지 않는다
- **공감 수 · 댓글 수는 글 행을 잠그고 다시 센다.** 더하고 빼면 한 번 틀어진 수가 영영 틀린 채로 남는다
- **공감순 커서는 순서가 움직인다.** 앱이 `id` 로 중복을 거른다. 한 쪽은 20개
- 커뮤니티는 JPA 엔티티 없이 SQL 로만 다룬다(`CommunityStore`) — `FOR UPDATE` · `ON CONFLICT` · 행 비교를 쓰고,
  한 트랜잭션에서 JPA 와 섞으면 flush 시점 때문에 방금 쓴 것을 못 읽는다
- 닉네임은 `PATCH /api/me` — 글에 복사하지 않으므로 바꾸면 지난 글의 작성자 이름도 바뀐다. 중복 허용

### 인증이 필요 없는 경로

`/health` · `/health/ready` · `/api/auth/**`, 그리고 커뮤니티 읽기(`GET /api/community/posts` · `/api/community/posts/{id}` ·
`/api/users/{id}/profile` · `/api/users/{id}/posts`)다. 나머지는 전부 토큰이 있어야 한다.
**토큰을 보냈으면 읽기에서도 맞아야 한다** — 만료된 토큰은 인증이 필요 없는 경로에서도 401 이다.
401 에는 `{ "code": "unauthorized", "message": … }` 본문이 붙는다. 지운 계정의 토큰이면 코드가 `account_deleted`다.

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
| `kkume.audio.bucket` | `KKUME_AUDIO_BUCKET` | 오디오를 받지 않는다(`503 audio_unavailable`). 로컬은 비워 둬도 뜬다 |
| `kkume.stt.*` | — | 작업 큐 설정. 변환기가 없으면 작업을 받아 두기만 한다 |

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
