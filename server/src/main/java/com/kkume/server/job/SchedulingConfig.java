package com.kkume.server.job;

import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;

/** 변환 작업 일꾼({@link SttWorker#poll()})을 주기적으로 부른다. */
@Configuration
@EnableScheduling
class SchedulingConfig {
}
