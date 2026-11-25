FROM node:24-bookworm-slim AS viewer-build
WORKDIR /app/frontend

COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

COPY frontend/ ./
RUN npm run build


FROM maven:3.9-eclipse-temurin-21 AS backend-build
WORKDIR /app

COPY backend/pom.xml backend/pom.xml
RUN mvn -B -f backend/pom.xml dependency:go-offline

COPY backend/src backend/src
COPY --from=viewer-build /app/frontend/dist backend/src/main/resources/static

RUN mvn -B -f backend/pom.xml package -DskipTests


FROM eclipse-temurin:21-jre-jammy
WORKDIR /app

RUN groupadd --system app \
    && useradd --system --gid app app

COPY --from=backend-build \
    /app/backend/target/backend-0.0.1-SNAPSHOT.jar app.jar

USER app

ENV SERVER_PORT=8080
EXPOSE 8080

ENTRYPOINT ["java", "-jar", "/app/app.jar"]