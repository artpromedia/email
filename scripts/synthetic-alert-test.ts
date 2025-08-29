#!/usr/bin/env node

/**
 * Synthetic Alert Testing Script
 * Injects failures to test monitoring and alerting pipeline
 */

import { initTelemetry, AlertManager } from '../packages/observability/dist/index.js';

const config = {
  serviceName: 'ceerion-synthetic-tester',
  serviceVersion: '1.0.0',
  environment: 'test',
  otlpEndpoint: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318',
  prometheusEnabled: true,
};

const telemetry = initTelemetry(config);
const alertManager = new AlertManager();

async function main() {
  const testType = process.argv[2] || 'all';
  
  console.log(`🧪 Starting synthetic alert tests: ${testType}`);
  
  switch (testType) {
    case 'smtp-queue':
      await testSmtpQueueBacklog();
      break;
    case 'dmarc-failure':
      await testDmarcFailures();
      break;
    case 'tls-failure':
      await testTlsFailures();
      break;
    case 'auth-failure':
      await testAuthFailures();
      break;
    case 'indexer-latency':
      await testIndexerLatency();
      break;
    case 'smtp-latency':
      await testSmtpLatency();
      break;
    case 'all':
      await testAllAlerts();
      break;
    default:
      console.log('Usage: node synthetic-test.js [smtp-queue|dmarc-failure|tls-failure|auth-failure|indexer-latency|smtp-latency|all]');
      process.exit(1);
  }
  
  console.log('✅ Synthetic alert tests completed');
  process.exit(0);
}

async function testSmtpQueueBacklog() {
  console.log('📧 Testing SMTP Queue Backlog alert...');
  
  // Inject high queue size
  telemetry.recordSmtpQueueSize('outbound', 'high', 1500);
  telemetry.recordSmtpQueueSize('outbound', 'medium', 800);
  telemetry.recordSmtpQueueSize('inbound', 'high', 300);
  
  await alertManager.fireTestAlert('SMTP Queue Backlog');
  
  console.log('   ✓ Injected 2600 emails in queue (threshold: 1000)');
}

async function testDmarcFailures() {
  console.log('🛡️ Testing DMARC Failure Rate alert...');
  
  // Inject DMARC failures
  for (let i = 0; i < 50; i++) {
    telemetry.recordDmarcReport('test-domain.com', 'reject', 'reject');
  }
  
  // Some successful reports
  for (let i = 0; i < 30; i++) {
    telemetry.recordDmarcReport('test-domain.com', 'none', 'pass');
  }
  
  await alertManager.fireTestAlert('High DMARC Failure Rate');
  
  console.log('   ✓ Injected 62.5% DMARC failure rate (threshold: 10%)');
}

async function testTlsFailures() {
  console.log('🔒 Testing TLS-RPT Failure Rate alert...');
  
  // Inject TLS failures
  for (let i = 0; i < 15; i++) {
    telemetry.recordTlsRptReport('smtp.test-domain.com', 'enforce', 'failure');
  }
  
  // Some successful reports
  for (let i = 0; i < 100; i++) {
    telemetry.recordTlsRptReport('smtp.test-domain.com', 'enforce', 'success');
  }
  
  await alertManager.fireTestAlert('TLS-RPT Failure Spike');
  
  console.log('   ✓ Injected 13% TLS failure rate (threshold: 5%)');
}

async function testAuthFailures() {
  console.log('🔐 Testing Authentication Failure Rate alert...');
  
  // Inject auth failures
  for (let i = 0; i < 100; i++) {
    telemetry.recordAuthAttempt('password', 'failure', 'user');
  }
  
  // Some successful auths
  for (let i = 0; i < 200; i++) {
    telemetry.recordAuthAttempt('password', 'success', 'user');
  }
  
  await alertManager.fireTestAlert('High Authentication Failure Rate');
  
  console.log('   ✓ Injected 33% auth failure rate (threshold: 20%)');
}

async function testIndexerLatency() {
  console.log('📇 Testing Indexer Latency alert...');
  
  // Inject high latency readings
  for (let i = 0; i < 10; i++) {
    telemetry.recordIndexerLatency('full-text', 3.5 + Math.random());
    telemetry.recordIndexerLatency('metadata', 2.8 + Math.random());
  }
  
  await alertManager.fireTestAlert('Indexer High Latency');
  
  console.log('   ✓ Injected >3.5s indexer latency (threshold: 2s)');
}

async function testSmtpLatency() {
  console.log('📮 Testing SMTP Processing Latency alert...');
  
  // Inject high processing times
  for (let i = 0; i < 10; i++) {
    telemetry.recordSmtpProcessingTime('outbound', 'success', 45 + Math.random() * 10);
  }
  
  await alertManager.fireTestAlert('SMTP Processing High Latency');
  
  console.log('   ✓ Injected >45s SMTP processing time (threshold: 30s)');
}

async function testAllAlerts() {
  console.log('🎯 Testing all alerts in sequence...');
  
  await testSmtpQueueBacklog();
  await sleep(2000);
  
  await testDmarcFailures();
  await sleep(2000);
  
  await testTlsFailures();
  await sleep(2000);
  
  await testAuthFailures();
  await sleep(2000);
  
  await testIndexerLatency();
  await sleep(2000);
  
  await testSmtpLatency();
  
  console.log('🚨 All synthetic alerts fired! Check your monitoring dashboard.');
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('\\n🛑 Shutting down synthetic tester...');
  await telemetry.shutdown();
  process.exit(0);
});

main().catch(console.error);
