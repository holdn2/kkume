package com.kkume.server.moderation;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import software.amazon.awssdk.auth.credentials.DefaultCredentialsProvider;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.sns.SnsClient;
import software.amazon.awssdk.services.sns.model.PublishRequest;

import com.kkume.server.audio.AudioProperties;
import com.kkume.server.community.CommunityLimits;

/**
 * 신고 알림. 주제가 있으면 SNS 로 운영자 메일을 보내고, 없으면 기록만 남긴다.
 *
 * <p>자격증명은 오디오와 같이 EC2 인스턴스 프로파일에서 온다 — 서버에 키를 두지 않는다.
 * 리전은 오디오 버킷과 같다(무료 플랜 계정은 시드니에 묶여 있다).
 */
@Configuration
@EnableConfigurationProperties(ModerationProperties.class)
public class ModerationConfig {

	private static final Logger log = LoggerFactory.getLogger(ModerationConfig.class);

	@Bean
	ReportNotifier reportNotifier(ModerationProperties properties, AudioProperties audio) {
		if (!properties.alertsEnabled()) {
			log.info("kkume.moderation.topic-arn 이 비어 있어 신고 알림을 보내지 않습니다.");
			return event -> log.info("신고 알림(보내지 않음) {} {} {} {}명", event.targetType(), event.targetId(),
					event.reason(), event.reporters());
		}
		SnsClient sns = SnsClient.builder()
			.region(Region.of(audio.region()))
			.credentialsProvider(DefaultCredentialsProvider.builder().build())
			.build();
		int hideAt = CommunityLimits.HIDE_AT_REPORTERS;
		return event -> sns.publish(PublishRequest.builder()
			.topicArn(properties.topicArn())
			.subject(ReportMessage.subject(event, hideAt))
			.message(ReportMessage.body(event, hideAt))
			.build());
	}
}
