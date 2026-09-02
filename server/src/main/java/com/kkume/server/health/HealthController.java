package com.kkume.server.health;

import java.util.Map;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 배포 환경의 헬스 체크 엔드포인트.
 *
 * Actuator를 쓰지 않고 컨트롤러로 직접 둔다. Actuator의 기본 경로는
 * /actuator/health 라서 로드밸런서·컨테이너 헬스 체크가 보는 경로와 달라지고,
 * 골격 단계에 의존성을 하나 더 들이게 된다.
 */
@RestController
public class HealthController {

	@GetMapping("/health")
	public Map<String, String> health() {
		return Map.of("status", "UP");
	}
}
