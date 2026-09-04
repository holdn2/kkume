package com.kkume.server.health;

import java.sql.Connection;
import java.sql.SQLException;
import java.util.Map;

import javax.sql.DataSource;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 요청을 처리할 준비가 됐는지(readiness). DB 연결까지 확인한다.
 *
 * <p><b>{@code /health} 와 나누는 이유가 있다.</b> {@code /health} 는
 * "프로세스가 살아 있나"(liveness)라서 DB 를 보지 않는다. 둘을 한 경로에 섞으면
 * DB 가 잠깐 끊겼을 때 멀쩡한 프로세스를 재시작하게 되고, 재시작해도 DB 는
 * 여전히 끊겨 있으므로 재시작만 반복한다.
 */
@RestController
public class ReadinessController {

	private static final int VALIDATION_TIMEOUT_SECONDS = 2;

	private final DataSource dataSource;

	public ReadinessController(DataSource dataSource) {
		this.dataSource = dataSource;
	}

	@GetMapping("/health/ready")
	public ResponseEntity<Map<String, String>> ready() {
		if (databaseReachable()) {
			return ResponseEntity.ok(Map.of("status", "UP", "db", "UP"));
		}
		return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
			.body(Map.of("status", "DOWN", "db", "DOWN"));
	}

	private boolean databaseReachable() {
		try (Connection connection = dataSource.getConnection()) {
			return connection.isValid(VALIDATION_TIMEOUT_SECONDS);
		}
		catch (SQLException ex) {
			return false;
		}
	}
}
