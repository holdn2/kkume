package com.kkume.server.audio;

import java.util.UUID;

import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 오디오 업로드와 변환 상태. 계약은 문서 039 03장이다.
 *
 * <p>사용자는 토큰에서만 온다. 경로의 {@code {id}}는 기기가 만든 기록 id 다.
 */
@RestController
@RequestMapping("/api/dreams/{id}")
public class AudioController {

	private final AudioService audio;

	public AudioController(AudioService audio) {
		this.audio = audio;
	}

	/** ② 업로드 자리. 본문이 없으면 m4a 다 */
	@PostMapping("/audio/upload")
	public AudioService.UploadTicket upload(@AuthenticationPrincipal Jwt jwt, @PathVariable String id,
			@RequestBody(required = false) UploadRequest request) {
		return this.audio.prepareUpload(user(jwt), id, request == null ? null : request.format());
	}

	/** ④ 다 올렸다. 같은 요청을 두 번 보내도 된다 */
	@PostMapping("/audio/complete")
	public SttStatusResponse complete(@AuthenticationPrincipal Jwt jwt, @PathVariable String id,
			@RequestBody(required = false) CompleteRequest request) {
		return new SttStatusResponse(this.audio.complete(user(jwt), id, request == null ? null : request.key()));
	}

	/** ⑦ 변환 상태와 원문 */
	@GetMapping("/stt")
	public AudioService.SttView stt(@AuthenticationPrincipal Jwt jwt, @PathVariable String id) {
		return this.audio.stt(user(jwt), id);
	}

	/** 실패한 변환을 다시 */
	@PostMapping("/stt/retry")
	public SttStatusResponse retry(@AuthenticationPrincipal Jwt jwt, @PathVariable String id) {
		return new SttStatusResponse(this.audio.retry(user(jwt), id));
	}

	@ExceptionHandler(AudioApiException.class)
	ResponseEntity<ErrorResponse> onError(AudioApiException ex) {
		return ResponseEntity.status(ex.status()).body(new ErrorResponse(ex.code(), ex.getMessage()));
	}

	private static UUID user(Jwt jwt) {
		return UUID.fromString(jwt.getSubject());
	}

	/** {@code format}: {@code "m4a"} · {@code "wav"} */
	public record UploadRequest(String format) {
	}

	public record CompleteRequest(String key) {
	}

	public record SttStatusResponse(String sttStatus) {
	}

	public record ErrorResponse(String code, String message) {
	}
}
