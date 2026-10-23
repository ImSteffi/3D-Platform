package com.example.platform.config;

import java.net.URI;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import software.amazon.awssdk.auth.credentials.AwsBasicCredentials;
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.S3Configuration;

@Configuration
public class R2Config {
        @Bean
        public software.amazon.awssdk.services.s3.presigner.S3Presigner r2Presigner(
                        @Value("${storage.r2.endpoint}") String endpoint,
                        @Value("${storage.r2.access-key-id}") String accessKeyId,
                        @Value("${storage.r2.secret-access-key}") String secretAccessKey) {
                return software.amazon.awssdk.services.s3.presigner.S3Presigner.builder()
                        .endpointOverride(URI.create(endpoint))
                        .region(Region.of("auto"))
                        .credentialsProvider(StaticCredentialsProvider.create(
                                AwsBasicCredentials.create(accessKeyId, secretAccessKey)))
                        .serviceConfiguration(S3Configuration.builder().pathStyleAccessEnabled(true).build())
                        .build();
        }


        @Bean
        public S3Client r2Client(
                        @Value("${storage.r2.endpoint}") String endpoint,
                        @Value("${storage.r2.access-key-id}") String accessKeyId,
                        @Value("${storage.r2.secret-access-key}") String secretAccessKey) {

                return S3Client.builder()
                                .endpointOverride(URI.create(endpoint))
                                .region(Region.of("auto"))
                                .credentialsProvider(
                                                StaticCredentialsProvider.create(
                                                                AwsBasicCredentials.create(
                                                                                accessKeyId,
                                                                                secretAccessKey)))
                                .serviceConfiguration(
                                                S3Configuration.builder()
                                                                .pathStyleAccessEnabled(true)
                                                                .chunkedEncodingEnabled(false)
                                                                .build())
                                .build();
        }
}