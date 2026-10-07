package com.kkume.server.moderation;

import java.time.Instant;
import java.util.UUID;

/**
 * 새로 들어온 신고 하나. <b>이용자가 쓴 글자는 들어 있지 않다</b> — 종류 · id · 정해진 사유 · 수뿐이다(문서 072 04장).
 * 메일은 Gmail 을 거치므로, 꿈 내용이 여기 섞이면 Google 로 한 번 더 넘어간다.
 *
 * @param targetType {@code post} · {@code comment}
 * @param reason {@code sexual} · {@code violence} · {@code spam} · {@code other} 중 하나
 * @param reporters 지금까지 이 대상을 신고한 서로 다른 사람 수(이번 것 포함)
 * @param autoHidden 이번 신고로 자동 가림 기준에 닿았다
 */
public record ReportEvent(String targetType, UUID targetId, String reason, int reporters, boolean autoHidden,
		Instant at) {
}
