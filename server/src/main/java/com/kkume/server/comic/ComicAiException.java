package com.kkume.server.comic;

/** 모델 호출 실패. {@code usage}는 원가 기록에 쓴다 — 거절된 호출도 한 줄 남긴다 */
public class ComicAiException extends RuntimeException {

	public enum Kind {

		/** 내용 정책으로 거절(Cloudflare 8007 NSFW). 만화는 refused 로 끝나고 하루 몫에서 빠진다 */
		REFUSED,

		/** 무료 한도를 다 썼다(Cloudflare 3036). 그날(UTC) 남은 요청을 503 comic_budget_exhausted 로 막는다 */
		BUDGET,

		/** 그 밖 — 모델 장애 · 시한 초과 · 빈 응답. 만화는 failed 로 끝나고 하루 몫에서 빠진다 */
		FAILED
	}

	private final Kind kind;

	private final String code;

	private final transient ComicAi.Usage usage;

	public ComicAiException(Kind kind, String code, String message, ComicAi.Usage usage, Throwable cause) {
		super(message, cause);
		this.kind = kind;
		this.code = code;
		this.usage = usage;
	}

	public Kind kind() {
		return kind;
	}

	/** 원가 · 만화 행에 남길 짧은 까닭. 예: {@code cf_8007}, {@code http_502}, {@code timeout} */
	public String code() {
		return code;
	}

	public ComicAi.Usage usage() {
		return usage;
	}
}
