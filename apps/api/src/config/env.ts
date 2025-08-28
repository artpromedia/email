import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables from .env file
dotenv.config({ path: path.join(__dirname, '../../.env') });

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
}

export function loadEnv(): Environment {
  return {
    NODE_ENV: process.env.NODE_ENV || 'development',
    BRAND_NAME: process.env.BRAND_NAME || 'CEERION',
    BASE_DOMAIN: process.env.BASE_DOMAIN || 'mail.ceerion.com',
    DATABASE_URL: process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/ceerion_mail',
    REDIS_URL: process.env.REDIS_URL || 'redis://localhost:6379',
    JWT_PRIVATE_KEY: process.env.JWT_PRIVATE_KEY || 'dev-only-rs256-key',
    OIDC_GOOGLE_CLIENT_ID: process.env.OIDC_GOOGLE_CLIENT_ID || '__placeholder__',
    OIDC_GOOGLE_CLIENT_SECRET: process.env.OIDC_GOOGLE_CLIENT_SECRET || '__placeholder__',
    API_PORT: parseInt(process.env.API_PORT || '4000', 10),
    API_HOST: process.env.API_HOST || 'localhost',
  };
}
