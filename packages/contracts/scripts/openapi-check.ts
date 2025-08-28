#!/usr/bin/env ts-node

import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';

const OPENAPI_FILE = path.join(__dirname, '../openapi/ceerion-mail.yml');

async function checkOpenAPISpec(): Promise<void> {
  try {
    console.log('🔍 Checking OpenAPI specification...');
    
    if (!fs.existsSync(OPENAPI_FILE)) {
      throw new Error(`OpenAPI file not found: ${OPENAPI_FILE}`);
    }

    const content = fs.readFileSync(OPENAPI_FILE, 'utf8');
    const spec = yaml.load(content) as any;

    // Basic validation
    if (!spec.openapi) {
      throw new Error('Missing openapi version');
    }

    if (!spec.info) {
      throw new Error('Missing info section');
    }

    if (!spec.paths) {
      throw new Error('Missing paths section');
    }

    console.log('✅ OpenAPI specification is valid');
    console.log(`   Version: ${spec.openapi}`);
    console.log(`   Title: ${spec.info.title}`);
    console.log(`   API Version: ${spec.info.version}`);
    console.log(`   Paths: ${Object.keys(spec.paths).length}`);
    
  } catch (error) {
    console.error('❌ OpenAPI specification check failed:');
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

// Add js-yaml dependency check
if (require.resolve('js-yaml')) {
  checkOpenAPISpec();
} else {
  console.log('⚠️  js-yaml not found, skipping OpenAPI validation');
}
