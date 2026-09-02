# 배포처를 바꿔도 그대로 쓰기 위한 이미지 (계획서 10장).
# 빌드 단계에서 Gradle 래퍼를 그대로 쓰므로 호스트에 Gradle이나 JDK 21이 없어도 된다.

FROM eclipse-temurin:21-jdk AS build
WORKDIR /workspace

# 의존성 해석 결과를 별도 레이어로 남긴다. src만 바뀌면 이 레이어는 재사용된다.
COPY gradle gradle
COPY gradlew settings.gradle build.gradle ./
RUN ./gradlew --no-daemon dependencies

COPY src src
RUN ./gradlew --no-daemon bootJar

FROM eclipse-temurin:21-jre
WORKDIR /app
COPY --from=build /workspace/build/libs/*.jar app.jar
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
