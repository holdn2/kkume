package com.kkume.server.dream;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * 꿈 기록 증분 동기화.
 *
 * <p>사용자는 <b>토큰에서만</b> 온다. 요청 본문이나 쿼리로 받지 않는다 —
 * 받으면 남의 id 를 적어 넣는 순간 남의 기록을 읽고 쓸 수 있다.
 */
@RestController
@RequestMapping("/api/sync")
public class SyncController {

	private final SyncService sync;

	public SyncController(SyncService sync) {
		this.sync = sync;
	}

	/**
	 * 마지막으로 받아간 뒤 바뀐 기록을 받아간다.
	 *
	 * <p>첫 동기화는 {@code since} 없이 부른다. 기기를 바꿨거나 앱을 다시 깐 경우가
	 * 여기에 해당하고, 서버에 있는 전부가 페이지로 나뉘어 내려간다.
	 */
	@GetMapping("/dreams")
	public PullResponse pull(@AuthenticationPrincipal Jwt jwt,
			@RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant since,
			@RequestParam(required = false) String cursor,
			@RequestParam(defaultValue = "100") int limit) {
		UUID userId = UUID.fromString(jwt.getSubject());
		SyncService.Page page = this.sync.pull(userId, since == null ? Instant.EPOCH : since, cursor, limit);
		return new PullResponse(page.dreams(), page.nextSince(), page.nextCursor(), page.hasMore());
	}

	/**
	 * 기기에 쌓인 기록을 올린다. 건별 결과를 돌려주고, <b>일부가 실패해도 나머지는 저장된다.</b>
	 */
	@PostMapping("/dreams")
	public PushResponse push(@AuthenticationPrincipal Jwt jwt, @RequestBody PushRequest request) {
		UUID userId = UUID.fromString(jwt.getSubject());
		List<DreamPayload> payloads = (request == null || request.dreams() == null)
				? List.of() : request.dreams();
		return new PushResponse(this.sync.push(userId, payloads));
	}

	/**
	 * 앞의 100건만 처리하고 나머지를 버리지 않는다. 버리면 기기는 올렸다고 믿고
	 * 그 기록들을 다시 보내지 않는다.
	 */
	@ExceptionHandler(SyncService.BatchTooLargeException.class)
	ResponseEntity<ErrorResponse> onBatchTooLarge(SyncService.BatchTooLargeException ex) {
		return ResponseEntity.status(HttpStatus.BAD_REQUEST)
			.body(new ErrorResponse("too_many", ex.getMessage()));
	}

	public record PullResponse(List<DreamView> dreams, Instant nextSince, String nextCursor, boolean hasMore) {
	}

	public record PushRequest(List<DreamPayload> dreams) {
	}

	public record PushResponse(List<SyncResult> results) {
	}

	public record ErrorResponse(String code, String message) {
	}
}
