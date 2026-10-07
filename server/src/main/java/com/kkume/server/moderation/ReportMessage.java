package com.kkume.server.moderation;

import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.Map;

/**
 * 신고 알림 메일의 제목과 본문.
 *
 * <p><b>제목은 ASCII 로만 쓴다.</b> SNS 는 메일 제목에 ASCII 만 받고, 한글이 섞이면 발행 자체를 거절한다.
 * 한글은 본문에 둔다.
 */
final class ReportMessage {

	private static final DateTimeFormatter KST = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm 'KST'")
		.withZone(ZoneId.of("Asia/Seoul"));

	private static final Map<String, String> REASONS = Map.of("sexual", "성적인 내용", "violence", "폭력 · 혐오",
			"spam", "스팸 · 광고", "other", "기타");

	private ReportMessage() {
	}

	/** 예: {@code [kkume report] post / spam / 2 of 3} · 자동 가림이면 앞에 {@code [AUTO-HIDDEN]} */
	static String subject(ReportEvent e, int hideAt) {
		String base = "[kkume report] %s / %s / %d of %d".formatted(e.targetType(), e.reason(), e.reporters(), hideAt);
		return e.autoHidden() ? "[AUTO-HIDDEN] " + base : base;
	}

	static String body(ReportEvent e, int hideAt) {
		String kind = "post".equals(e.targetType()) ? "글" : "댓글";
		String hidden = e.autoHidden()
				? "이번 신고로 서로 다른 " + hideAt + "명이 모여 자동으로 가렸습니다."
				: "서로 다른 " + hideAt + "명이 모이면 자동으로 가립니다.";
		return """
				꾸메에 신고가 들어왔습니다. 24시간 안에 확인해 주세요.

				대상   %s %s
				사유   %s (%s)
				신고   지금까지 서로 다른 %d명 — %s
				시각   %s

				보기   ./moderate.sh show %s %s
				처리   ./moderate.sh remove %s %s   (가림)
				       ./moderate.sh dismiss %s %s  (문제없음)

				이 메일에는 신고된 글의 내용을 넣지 않습니다. 내용은 위 명령으로 봅니다.
				""".formatted(kind, e.targetId(), REASONS.getOrDefault(e.reason(), e.reason()), e.reason(),
				e.reporters(), hidden, KST.format(e.at()), e.targetType(), e.targetId(), e.targetType(), e.targetId(),
				e.targetType(), e.targetId());
	}
}
