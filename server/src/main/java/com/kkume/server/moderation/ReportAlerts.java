package com.kkume.server.moderation;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.DisposableBean;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

/**
 * 신고 알림을 <b>신고가 커밋된 뒤에</b>, 요청과 따로 보낸다.
 *
 * <ul>
 * <li>커밋 뒤 — 신고가 롤백됐는데 메일만 가는 일이 없게
 * <li>따로 — 메일이 느리거나 실패해도 신고는 실패하지 않는다. 앱에는 지금처럼 204 가 간다. 실패는 기록만 남긴다
 * </ul>
 */
@Component
public class ReportAlerts implements DisposableBean {

	private static final Logger log = LoggerFactory.getLogger(ReportAlerts.class);

	private final ReportNotifier notifier;

	private final ExecutorService sender = Executors.newSingleThreadExecutor(r -> {
		Thread t = new Thread(r, "report-alerts");
		t.setDaemon(true);
		return t;
	});

	public ReportAlerts(ReportNotifier notifier) {
		this.notifier = notifier;
	}

	/** 지금 트랜잭션이 커밋되면 보낸다. 트랜잭션 밖에서 부르면 곧바로 보낸다 */
	public void afterCommit(ReportEvent event) {
		if (!TransactionSynchronizationManager.isSynchronizationActive()) {
			send(event);
			return;
		}
		TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
			@Override
			public void afterCommit() {
				send(event);
			}
		});
	}

	private void send(ReportEvent event) {
		this.sender.execute(() -> {
			try {
				this.notifier.notify(event);
			}
			catch (RuntimeException ex) {
				log.warn("신고 알림을 보내지 못했습니다 {} {} — 신고는 저장됐습니다", event.targetType(), event.targetId(), ex);
			}
		});
	}

	@Override
	public void destroy() {
		this.sender.shutdown();
	}
}
