import * as dotenv from "dotenv";
import * as path from "path";

// Load environment variables from .env file
dotenv.config({ path: path.join(__dirname, "../../.env") });

export interface Environment {
  NODE_ENV: string;
  BRAND_NAME: string;
  BASE_DOMAIN: string;
  DATABASE_URL: string;
  REDIS_URL: string;
  JWT_PRIVATE_KEY: string;
  OIDC_GOOGLE_CLIENT_ID: string;
  OIDC_GOOGLE_CLIENT_SECRET: string;
  API_PORT: number;
  API_HOST: string;
  OTEL_EXPORTER_OTLP_ENDPOINT?: string;
  OTEL_SERVICE_NAME?: string;
  PROMETHEUS_ENABLED?: boolean;
  // MFA encryption keys
  MFA_ENCRYPTION_KEY: string;
  KMS_ENDPOINT?: string;
}

export function loadEnv(): Environment {
  return {
    NODE_ENV: process.env.NODE_ENV || "development",
    BRAND_NAME: process.env.BRAND_NAME || "CEERION",
    BASE_DOMAIN: process.env.BASE_DOMAIN || "mail.ceerion.com",
    DATABASE_URL:
      process.env.DATABASE_URL ||
      "postgres://postgres:postgres@localhost:5432/ceerion_mail",
    REDIS_URL: process.env.REDIS_URL || "redis://localhost:6379",
    JWT_PRIVATE_KEY: process.env.JWT_PRIVATE_KEY || "dev-only-rs256-key",
    OIDC_GOOGLE_CLIENT_ID:
      process.env.OIDC_GOOGLE_CLIENT_ID || "__placeholder__",
    OIDC_GOOGLE_CLIENT_SECRET:
      process.env.OIDC_GOOGLE_CLIENT_SECRET || "__placeholder__",
    API_PORT: parseInt(process.env.API_PORT || "4000", 10),
    API_HOST: process.env.API_HOST || "localhost",
    OTEL_EXPORTER_OTLP_ENDPOINT: process.env.OTEL_EXPORTER_OTLP_ENDPOINT,
    OTEL_SERVICE_NAME: process.env.OTEL_SERVICE_NAME || "ceerion-api",
    PROMETHEUS_ENABLED: process.env.PROMETHEUS_ENABLED !== "false",
    // MFA encryption - use dev key if not provided
    MFA_ENCRYPTION_KEY:
      process.env.MFA_ENCRYPTION_KEY || "dev-only-mfa-key-32-chars-long!!!",
    KMS_ENDPOINT: process.env.KMS_ENDPOINT,
  };
}
