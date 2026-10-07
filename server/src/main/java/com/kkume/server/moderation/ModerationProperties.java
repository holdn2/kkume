package com.kkume.server.moderation;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * 신고 알림과 이용 정지 설정(문서 070 · 072).
 *
 * @param topicArn 신고 알림을 보낼 SNS 주제. <b>비어 있으면 알림을 보내지 않는다</b> — 로컬 · 테스트가 그렇다.
 *     배포에서는 {@code KKUME_REPORT_TOPIC_ARN}으로 넣는다
 * @param contact 이용이 제한된 계정에 보여 줄 문의처. 약관의 "이의는 문의처로"와 같은 주소다
 */
@ConfigurationProperties(prefix = "kkume.moderation")
public record ModerationProperties(String topicArn, String contact) {

	public boolean alertsEnabled() {
		return topicArn != null && !topicArn.isBlank();
	}
}
