package com.kkume.server;

import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.context.annotation.Bean;
import org.testcontainers.postgresql.PostgreSQLContainer;
import org.testcontainers.utility.DockerImageName;

/**
 * 테스트용 PostgreSQL.
 *
 * <p>H2 같은 다른 DB로 대신하지 않는다. Flyway 마이그레이션과 CHECK 제약이
 * 실제 PostgreSQL에서 도는지 확인하는 것이 이 테스트의 목적인데,
 * 다른 DB로 돌리면 정작 배포에서 깨지는 것을 못 잡는다.
 *
 * <p>compose.yaml 과 같은 이미지를 쓴다. 버전이 갈리면 로컬에서 되는 것이
 * 테스트에서 깨지거나 그 반대가 된다.
 */
@TestConfiguration(proxyBeanMethods = false)
public class TestcontainersConfiguration {

	// PostgreSQLContainer 는 이 버전에서 제네릭이 아니다. <?> 를 붙이면 컴파일되지 않는다.
	@Bean
	@ServiceConnection
	PostgreSQLContainer postgresContainer() {
		return new PostgreSQLContainer(DockerImageName.parse("postgres:17-alpine"));
	}
}
