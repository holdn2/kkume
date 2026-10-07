package com.kkume.server.moderation;

/** 운영자에게 신고를 알린다. 운영은 SNS 메일, 알림 주제가 없으면 아무 일도 하지 않는다 */
public interface ReportNotifier {

	void notify(ReportEvent event);
}
