#!/usr/bin/env node

/**
 * CEERION Mail Transport Setup Script
 * Sets up complete mail infrastructure with security hardening
 */

import { execSync } from 'child_process';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import crypto from 'crypto';
import bcrypt from 'bcrypt';

const DOMAIN = process.env.MAIL_DOMAIN || 'ceerion.com';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@ceerion.com';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'SecureMailAdmin2024!';

console.log('🚀 Setting up CEERION Mail Transport Stack...');

// Create required directories
const createDirectories = () => {
  console.log('📁 Creating directory structure...');
  
  const dirs = [
    'docker/ssl',
    'docker/dkim',
    'docker/postfix/scripts',
    'docker/dovecot/scripts',
    'docker/rspamd/config',
    'docker/nginx',
    'docker/backup/keys',
    'docker/kms',
    'env'
  ];

  dirs.forEach(dir => {
    const fullPath = join(process.cwd(), dir);
    if (!existsSync(fullPath)) {
      mkdirSync(fullPath, { recursive: true });
      console.log(`  ✓ Created: ${dir}`);
    }
  });
};

// Generate DKIM keys
const generateDKIMKeys = () => {
  console.log('🔐 Generating DKIM keys...');
  
  const keySize = 2048;
  const selector = 'ceerion';
  
  // Generate RSA key pair
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: keySize,
    publicKeyEncoding: {
      type: 'spki',
      format: 'pem'
    },
    privateKeyEncoding: {
      type: 'pkcs8',
      format: 'pem'
    }
  });

  // Extract public key for DNS
  const pubKeyBase64 = publicKey
    .replace(/-----BEGIN PUBLIC KEY-----/, '')
    .replace(/-----END PUBLIC KEY-----/, '')
    .replace(/\n/g, '');

  const dkimRecord = `v=DKIM1; h=sha256; k=rsa; p=${pubKeyBase64}`;

  // Save keys
  writeFileSync(join(process.cwd(), 'docker/dkim/private.key'), privateKey);
  writeFileSync(join(process.cwd(), 'docker/dkim/public.key'), publicKey);
  writeFileSync(join(process.cwd(), 'docker/dkim/dns-record.txt'), 
    `${selector}._domainkey.${DOMAIN} IN TXT "${dkimRecord}"`);

  console.log(`  ✓ DKIM keys generated for selector: ${selector}`);
  console.log(`  ✓ DNS record saved to docker/dkim/dns-record.txt`);
};

// Generate SSL certificates (self-signed for development)
const generateSSLCerts = () => {
  console.log('🔒 Generating SSL certificates...');
  
  const certPath = join(process.cwd(), 'docker/ssl');
  
  // Generate private key
  execSync(`openssl genrsa -out ${certPath}/mail.${DOMAIN}.key 2048`, { stdio: 'pipe' });
  
  // Generate certificate signing request
  const csrConfig = `
[req]
distinguished_name = req_distinguished_name
req_extensions = v3_req
prompt = no

[req_distinguished_name]
C = US
ST = California
L = San Francisco
O = CEERION
OU = Mail Services
CN = mail.${DOMAIN}

[v3_req]
keyUsage = keyEncipherment, dataEncipherment
extendedKeyUsage = serverAuth
subjectAltName = @alt_names

[alt_names]
DNS.1 = mail.${DOMAIN}
DNS.2 = ${DOMAIN}
DNS.3 = imap.${DOMAIN}
DNS.4 = smtp.${DOMAIN}
`;

  writeFileSync(join(certPath, 'cert.conf'), csrConfig);
  
  execSync(`openssl req -new -key ${certPath}/mail.${DOMAIN}.key -out ${certPath}/mail.${DOMAIN}.csr -config ${certPath}/cert.conf`, { stdio: 'pipe' });
  
  // Generate self-signed certificate
  execSync(`openssl x509 -req -in ${certPath}/mail.${DOMAIN}.csr -signkey ${certPath}/mail.${DOMAIN}.key -out ${certPath}/mail.${DOMAIN}.crt -days 365 -extensions v3_req -extfile ${certPath}/cert.conf`, { stdio: 'pipe' });
  
  // Generate DH parameters
  execSync(`openssl dhparam -out ${certPath}/dh.pem 2048`, { stdio: 'pipe' });

  console.log(`  ✓ SSL certificate generated for mail.${DOMAIN}`);
  console.log('  ⚠️  Self-signed certificate - replace with CA-signed cert for production');
};

// Generate encryption keys for backups
const generateEncryptionKeys = () => {
  console.log('🗝️  Generating encryption keys...');
  
  // Generate age key for backup encryption
  const ageKey = crypto.randomBytes(32).toString('base64');
  const backupKey = crypto.randomBytes(32).toString('hex');
  const kmsKey = crypto.randomBytes(32).toString('hex');
  
  writeFileSync(join(process.cwd(), 'docker/backup/keys/age.key'), ageKey);
  writeFileSync(join(process.cwd(), 'env/backup.key'), backupKey);
  writeFileSync(join(process.cwd(), 'env/kms.key'), kmsKey);

  console.log('  ✓ Backup encryption keys generated');
  console.log('  ⚠️  Store keys securely - required for backup restore');
};

// Create environment file
const createEnvironmentFile = () => {
  console.log('⚙️  Creating environment configuration...');
  
  const postgresPassword = crypto.randomBytes(16).toString('hex');
  const redisPassword = crypto.randomBytes(16).toString('hex');
  const rspamdPassword = crypto.randomBytes(16).toString('hex');
  const backupKey = crypto.randomBytes(32).toString('hex');
  
  const envContent = `# CEERION Mail Transport Environment
# Generated: ${new Date().toISOString()}

# Database Configuration
POSTGRES_PASSWORD=${postgresPassword}
REDIS_PASSWORD=${redisPassword}

# Mail Domain
MAIL_DOMAIN=${DOMAIN}
POSTFIX_MYHOSTNAME=mail.${DOMAIN}
POSTFIX_MYDOMAIN=${DOMAIN}

# Security
RSPAMD_PASSWORD=${rspamdPassword}

# Backup Configuration
BACKUP_ENCRYPTION_KEY=${backupKey}
KMS_MASTER_KEY=${crypto.randomBytes(32).toString('hex')}

# AWS Configuration (for backup storage)
AWS_ACCESS_KEY_ID=your_aws_access_key
AWS_SECRET_ACCESS_KEY=your_aws_secret_key
BACKUP_BUCKET=ceerion-mail-backups-${crypto.randomBytes(4).toString('hex')}

# Monitoring
WEBHOOK_URL=https://hooks.slack.com/your/webhook/url
`;

  writeFileSync(join(process.cwd(), '.env.mail'), envContent);
  
  console.log('  ✓ Environment file created: .env.mail');
  console.log('  ⚠️  Update AWS credentials and webhook URL');
};

// Create admin user
const createAdminUser = async () => {
  console.log('👤 Creating admin user...');
  
  const hashedPassword = await bcrypt.hash(ADMIN_PASSWORD, 12);
  const maildir = `${DOMAIN}/${ADMIN_EMAIL.split('@')[0]}/Maildir`;
  
  const userSQL = `
-- Admin user creation
INSERT INTO virtual_domains (domain) VALUES ('${DOMAIN}') ON CONFLICT (domain) DO NOTHING;

INSERT INTO virtual_users (email, password, domain_id, maildir, active) 
VALUES (
  '${ADMIN_EMAIL}',
  '${hashedPassword}',
  (SELECT id FROM virtual_domains WHERE domain = '${DOMAIN}'),
  '${maildir}',
  true
) ON CONFLICT (email) DO UPDATE SET 
  password = EXCLUDED.password,
  updated_at = CURRENT_TIMESTAMP;
`;

  writeFileSync(join(process.cwd(), 'docker/postgres/create-admin.sql'), userSQL);
  
  console.log(`  ✓ Admin user SQL created: ${ADMIN_EMAIL}`);
};

// Create DNS configuration template
const createDNSTemplate = () => {
  console.log('🌐 Creating DNS configuration template...');
  
  const dnsConfig = `# DNS Configuration for ${DOMAIN}
# Add these records to your DNS provider

# MX Record
${DOMAIN}. IN MX 10 mail.${DOMAIN}.

# A Record
mail.${DOMAIN}. IN A YOUR_SERVER_IP

# SPF Record
${DOMAIN}. IN TXT "v=spf1 mx a:mail.${DOMAIN} -all"

# DMARC Record
_dmarc.${DOMAIN}. IN TXT "v=DMARC1; p=quarantine; rua=mailto:dmarc@${DOMAIN}; ruf=mailto:dmarc@${DOMAIN}; sp=quarantine; adkim=r; aspf=r"

# DKIM Record (copy from docker/dkim/dns-record.txt)

# MTA-STS Record
_mta-sts.${DOMAIN}. IN TXT "v=STSv1; id=$(date +%Y%m%d%H%M%S)"

# TLS-RPT Record
_smtp._tls.${DOMAIN}. IN TXT "v=TLSRPTv1; rua=mailto:tls-rpt@${DOMAIN}"

# CAA Record (optional)
${DOMAIN}. IN CAA 0 issue "letsencrypt.org"
${DOMAIN}. IN CAA 0 iodef "mailto:security@${DOMAIN}"
`;

  writeFileSync(join(process.cwd(), 'dns-configuration.txt'), dnsConfig);
  
  console.log('  ✓ DNS template created: dns-configuration.txt');
};

// Create test script
const createTestScript = () => {
  console.log('🧪 Creating test script...');
  
  const testScript = `#!/usr/bin/env node

/**
 * CEERION Mail Transport Test Script
 * Tests SMTP/IMAP/JMAP functionality and security
 */

import nodemailer from 'nodemailer';
import Imap from 'imap';

const DOMAIN = '${DOMAIN}';
const TEST_EMAIL = '${ADMIN_EMAIL}';
const TEST_PASSWORD = '${ADMIN_PASSWORD}';

console.log('🧪 Testing CEERION Mail Transport Stack...');

// Test SMTP submission
const testSMTP = async () => {
  console.log('📧 Testing SMTP submission...');
  
  const transporter = nodemailer.createTransporter({
    host: 'localhost',
    port: 587,
    secure: false,
    auth: {
      user: TEST_EMAIL,
      pass: TEST_PASSWORD
    },
    tls: {
      rejectUnauthorized: false // For self-signed certs
    }
  });

  try {
    const info = await transporter.sendMail({
      from: TEST_EMAIL,
      to: 'external@example.com',
      subject: 'CEERION Mail Test - ' + new Date().toISOString(),
      text: 'This is a test message from CEERION Mail Transport.',
      html: '<p>This is a <b>test message</b> from CEERION Mail Transport.</p>'
    });

    console.log('  ✓ SMTP test successful:', info.messageId);
    return true;
  } catch (error) {
    console.log('  ✗ SMTP test failed:', error.message);
    return false;
  }
};

// Test IMAP connection
const testIMAP = async () => {
  console.log('📬 Testing IMAP connection...');
  
  return new Promise((resolve) => {
    const imap = new Imap({
      user: TEST_EMAIL,
      password: TEST_PASSWORD,
      host: 'localhost',
      port: 993,
      tls: true,
      tlsOptions: {
        rejectUnauthorized: false
      }
    });

    imap.once('ready', () => {
      console.log('  ✓ IMAP connection successful');
      imap.end();
      resolve(true);
    });

    imap.once('error', (err) => {
      console.log('  ✗ IMAP test failed:', err.message);
      resolve(false);
    });

    imap.connect();
  });
};

// Test JMAP endpoint
const testJMAP = async () => {
  console.log('🔌 Testing JMAP endpoint...');
  
  try {
    const response = await fetch('http://localhost:8080/jmap/session', {
      method: 'GET',
      headers: {
        'Authorization': 'Basic ' + Buffer.from(TEST_EMAIL + ':' + TEST_PASSWORD).toString('base64')
      }
    });

    if (response.ok) {
      console.log('  ✓ JMAP endpoint accessible');
      return true;
    } else {
      console.log('  ✗ JMAP test failed:', response.status);
      return false;
    }
  } catch (error) {
    console.log('  ✗ JMAP test failed:', error.message);
    return false;
  }
};

// Run all tests
const runTests = async () => {
  const results = {
    smtp: await testSMTP(),
    imap: await testIMAP(),
    jmap: await testJMAP()
  };

  console.log('\\n📊 Test Results:');
  console.log(\`  SMTP: \${results.smtp ? '✓ PASS' : '✗ FAIL'}\`);
  console.log(\`  IMAP: \${results.imap ? '✓ PASS' : '✗ FAIL'}\`);
  console.log(\`  JMAP: \${results.jmap ? '✓ PASS' : '✗ FAIL'}\`);

  const allPassed = Object.values(results).every(r => r);
  console.log(\`\\n\${allPassed ? '🎉 All tests passed!' : '⚠️  Some tests failed'}\`);
  
  process.exit(allPassed ? 0 : 1);
};

runTests().catch(console.error);
`;

  writeFileSync(join(process.cwd(), 'scripts/mail/test-mail-stack.js'), testScript);
  
  console.log('  ✓ Test script created: scripts/mail/test-mail-stack.js');
};

// Main setup function
const main = async () => {
  try {
    createDirectories();
    generateDKIMKeys();
    generateSSLCerts();
    generateEncryptionKeys();
    createEnvironmentFile();
    await createAdminUser();
    createDNSTemplate();
    createTestScript();

    console.log('\n🎉 CEERION Mail Transport setup completed!');
    console.log('\n📋 Next steps:');
    console.log('1. Update .env.mail with your AWS credentials');
    console.log('2. Configure DNS records from dns-configuration.txt');
    console.log('3. Start the mail stack: npm run mail:start');
    console.log('4. Test the setup: npm run mail:test');
    console.log('5. Set up backup schedule: npm run backup:test');
    
    console.log('\n⚠️  Security Notes:');
    console.log('- Replace self-signed certificates with CA-signed certificates');
    console.log('- Store encryption keys securely');
    console.log('- Configure firewall rules');
    console.log('- Set up log monitoring');
    console.log('- Test backup restore procedures');

  } catch (error) {
    console.error('❌ Setup failed:', error.message);
    process.exit(1);
  }
};

main();
