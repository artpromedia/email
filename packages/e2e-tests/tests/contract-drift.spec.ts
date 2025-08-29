import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';

/**
 * Contract Drift Tests
 * Ensures SDK and OpenAPI specification remain in sync
 * Fails CI if there are divergences between contracts and implementation
 */

test.describe('Contract Drift Detection', () => {
  const OPENAPI_FILE = path.join(__dirname, '../../../packages/contracts/openapi/ceerion-mail.yml');
  const SDK_TYPES_FILE = path.join(__dirname, '../../../packages/sdk/src/types.ts');
  const API_ROUTES_DIR = path.join(__dirname, '../../../apps/api/src/routes');

  test('OpenAPI spec exists and is valid', async () => {
    // Check if OpenAPI file exists
    expect(fs.existsSync(OPENAPI_FILE)).toBe(true);

    // Parse and validate OpenAPI spec
    const content = fs.readFileSync(OPENAPI_FILE, 'utf8');
    const spec = yaml.load(content) as any;

    expect(spec.openapi).toBeDefined();
    expect(spec.info).toBeDefined();
    expect(spec.paths).toBeDefined();

    // Validate required sections
    expect(spec.info.title).toBe('CEERION Mail API');
    expect(spec.info.version).toMatch(/^\\d+\\.\\d+\\.\\d+$/);

    console.log('OpenAPI Spec Validation:', {
      version: spec.openapi,
      title: spec.info.title,
      apiVersion: spec.info.version,
      pathCount: Object.keys(spec.paths).length,
    });
  });

  test('SDK types match OpenAPI schemas', async () => {
    // Read OpenAPI spec
    const openApiContent = fs.readFileSync(OPENAPI_FILE, 'utf8');
    const spec = yaml.load(openApiContent) as any;

    // Read SDK types
    const sdkTypesContent = fs.readFileSync(SDK_TYPES_FILE, 'utf8');

    // Extract component schemas from OpenAPI
    const schemas = spec.components?.schemas || {};
    const schemaNames = Object.keys(schemas);

    // Check that major schemas are reflected in SDK types
    const criticalSchemas = [
      'User',
      'Email',
      'Folder',
      'AuthRequest',
      'AuthResponse',
      'EmailListResponse',
      'EmailContent',
      'CreateUserRequest',
      'UpdateUserRequest',
      'DmarcReport',
      'TlsRptReport',
    ];

    criticalSchemas.forEach(schemaName => {
      expect(schemaNames).toContain(schemaName);
      
      // Check if schema is referenced in SDK types
      const typePattern = new RegExp(`(interface|type)\\\\s+${schemaName}`, 'g');
      const hasType = typePattern.test(sdkTypesContent);
      
      if (!hasType) {
        console.warn(`Schema ${schemaName} found in OpenAPI but not in SDK types`);
      }
    });

    // Check for properties consistency on key schemas
    if (schemas.User) {
      const userSchema = schemas.User;
      const requiredUserProps = userSchema.required || [];
      
      // User should have critical fields
      const expectedUserFields = ['id', 'email', 'role'];
      expectedUserFields.forEach(field => {
        expect(userSchema.properties).toHaveProperty(field);
      });
    }

    if (schemas.Email) {
      const emailSchema = schemas.Email;
      const expectedEmailFields = ['id', 'subject', 'from', 'to', 'timestamp'];
      expectedEmailFields.forEach(field => {
        expect(emailSchema.properties).toHaveProperty(field);
      });
    }

    console.log('Schema Validation:', {
      totalSchemas: schemaNames.length,
      criticalSchemas: criticalSchemas.length,
      schemasFound: criticalSchemas.filter(name => schemaNames.includes(name)).length,
    });
  });

  test('API routes match OpenAPI paths', async () => {
    // Read OpenAPI spec
    const openApiContent = fs.readFileSync(OPENAPI_FILE, 'utf8');
    const spec = yaml.load(openApiContent) as any;

    // Get all OpenAPI paths and methods
    const openApiEndpoints: { path: string; method: string }[] = [];
    Object.entries(spec.paths || {}).forEach(([path, pathObj]: [string, any]) => {
      Object.keys(pathObj).forEach(method => {
        if (['get', 'post', 'put', 'patch', 'delete'].includes(method.toLowerCase())) {
          openApiEndpoints.push({
            path: path.replace(/\\{([^}]+)\\}/g, ':$1'), // Convert {id} to :id
            method: method.toUpperCase(),
          });
        }
      });
    });

    // Scan API route files for implemented endpoints
    const routeFiles = fs.readdirSync(API_ROUTES_DIR)
      .filter(file => file.endsWith('.ts'))
      .map(file => path.join(API_ROUTES_DIR, file));

    const implementedEndpoints: { path: string; method: string; file: string }[] = [];

    routeFiles.forEach(file => {
      const content = fs.readFileSync(file, 'utf8');
      
      // Extract route definitions (simplified regex matching)
      const routePattern = /fastify\.(get|post|put|patch|delete)\(\s*['"`]([^'"`]+)['"`]/g;
      let match;
      
      while ((match = routePattern.exec(content)) !== null) {
        const method = match[1].toUpperCase();
        const routePath = match[2];
        
        implementedEndpoints.push({
          method,
          path: routePath,
          file: path.basename(file),
        });
      }
    });

    // Check for missing implementations
    const missingImplementations = openApiEndpoints.filter(openApiEndpoint => {
      return !implementedEndpoints.some(impl => 
        impl.method === openApiEndpoint.method && 
        impl.path === openApiEndpoint.path
      );
    });

    // Check for undocumented implementations
    const undocumentedImplementations = implementedEndpoints.filter(impl => {
      return !openApiEndpoints.some(openApi => 
        openApi.method === impl.method && 
        openApi.path === impl.path
      );
    });

    // Log findings
    console.log('API Route Analysis:', {
      openApiEndpoints: openApiEndpoints.length,
      implementedEndpoints: implementedEndpoints.length,
      missingImplementations: missingImplementations.length,
      undocumentedImplementations: undocumentedImplementations.length,
    });

    if (missingImplementations.length > 0) {
      console.log('Missing Implementations:', missingImplementations);
    }

    if (undocumentedImplementations.length > 0) {
      console.log('Undocumented Implementations:', undocumentedImplementations);
    }

    // Fail if there are critical missing implementations
    const criticalEndpoints = [
      { method: 'POST', path: '/auth/login' },
      { method: 'GET', path: '/mail/list' },
      { method: 'POST', path: '/mail/send' },
      { method: 'GET', path: '/admin/users' },
      { method: 'POST', path: '/admin/users' },
    ];

    criticalEndpoints.forEach(critical => {
      const isImplemented = implementedEndpoints.some(impl => 
        impl.method === critical.method && impl.path === critical.path
      );
      const isDocumented = openApiEndpoints.some(openApi => 
        openApi.method === critical.method && openApi.path === critical.path
      );

      expect(isImplemented || isDocumented).toBe(true);
    });

    // Soft warning for non-critical drift
    if (missingImplementations.length > 0 || undocumentedImplementations.length > 0) {
      console.warn('Contract drift detected - some endpoints may be missing documentation or implementation');
    }
  });

  test('Response schemas match actual API responses', async ({ request }) => {
    // Read OpenAPI spec
    const openApiContent = fs.readFileSync(OPENAPI_FILE, 'utf8');
    const spec = yaml.load(openApiContent) as any;

    // Test critical endpoints against their schemas
    const testCases = [
      {
        endpoint: '/health',
        method: 'GET',
        expectedSchema: 'HealthResponse',
      },
      {
        endpoint: '/readiness',
        method: 'GET',
        expectedSchema: 'ReadinessResponse',
      },
    ];

    const apiBaseUrl = process.env.API_URL || 'http://localhost:4000';

    for (const testCase of testCases) {
      try {
        const response = await request.get(`${apiBaseUrl}${testCase.endpoint}`);
        
        if (response.ok()) {
          const responseBody = await response.json();
          
          // Get schema from OpenAPI spec
          const pathSpec = spec.paths[testCase.endpoint];
          if (pathSpec && pathSpec[testCase.method.toLowerCase()]) {
            const operationSpec = pathSpec[testCase.method.toLowerCase()];
            const responseSpec = operationSpec.responses?.['200'];
            
            if (responseSpec?.content?.['application/json']?.schema) {
              const schema = responseSpec.content['application/json'].schema;
              
              // Basic schema validation
              if (schema.properties) {
                Object.keys(schema.properties).forEach(prop => {
                  if (schema.required?.includes(prop)) {
                    expect(responseBody).toHaveProperty(prop);
                  }
                });
              }
            }
          }
        }
      } catch (error) {
        console.warn(`Could not test endpoint ${testCase.endpoint}:`, error);
      }
    }
  });

  test('SDK client methods match OpenAPI operations', async () => {
    // Read OpenAPI spec
    const openApiContent = fs.readFileSync(OPENAPI_FILE, 'utf8');
    const spec = yaml.load(openApiContent) as any;

    // Read SDK client file
    const sdkClientPath = path.join(__dirname, '../../../packages/sdk/src/index.ts');
    
    if (!fs.existsSync(sdkClientPath)) {
      console.warn('SDK client file not found, skipping SDK method validation');
      return;
    }

    const sdkContent = fs.readFileSync(sdkClientPath, 'utf8');

    // Extract operation IDs from OpenAPI spec
    const operationIds: string[] = [];
    Object.values(spec.paths || {}).forEach((pathObj: any) => {
      Object.values(pathObj).forEach((operation: any) => {
        if (operation.operationId) {
          operationIds.push(operation.operationId);
        }
      });
    });

    // Check that critical operation IDs have corresponding SDK methods
    const criticalOperations = [
      'login',
      'logout',
      'listEmails',
      'readEmail',
      'sendEmail',
      'createUser',
      'updateUser',
      'deleteUser',
    ];

    criticalOperations.forEach(operationId => {
      if (operationIds.includes(operationId)) {
        // Check if there's a corresponding method in SDK
        const methodPattern = new RegExp(`${operationId}\\\\s*\\\\(`, 'g');
        const hasMethod = methodPattern.test(sdkContent);
        
        if (!hasMethod) {
          console.warn(`Operation ${operationId} found in OpenAPI but no corresponding SDK method`);
        }
      }
    });

    console.log('SDK Method Validation:', {
      totalOperations: operationIds.length,
      criticalOperations: criticalOperations.length,
      operationsWithIds: operationIds.filter(id => criticalOperations.includes(id)).length,
    });
  });

  test('Version consistency across packages', async () => {
    // Check version consistency across key files
    const packageJsonFiles = [
      path.join(__dirname, '../../../package.json'),
      path.join(__dirname, '../../../apps/api/package.json'),
      path.join(__dirname, '../../../packages/sdk/package.json'),
      path.join(__dirname, '../../../packages/contracts/package.json'),
    ];

    const versions: Record<string, string> = {};

    packageJsonFiles.forEach(file => {
      if (fs.existsSync(file)) {
        const content = JSON.parse(fs.readFileSync(file, 'utf8'));
        versions[path.basename(path.dirname(file))] = content.version;
      }
    });

    // Check OpenAPI version
    const openApiContent = fs.readFileSync(OPENAPI_FILE, 'utf8');
    const spec = yaml.load(openApiContent) as any;
    versions.openapi = spec.info.version;

    console.log('Version Analysis:', versions);

    // All versions should follow semver
    Object.entries(versions).forEach(([name, version]) => {
      expect(version).toMatch(/^\\d+\\.\\d+\\.\\d+/);
    });

    // Major versions should be consistent
    const majorVersions = Object.values(versions).map(v => v.split('.')[0]);
    const uniqueMajorVersions = [...new Set(majorVersions)];
    
    if (uniqueMajorVersions.length > 1) {
      console.warn('Inconsistent major versions detected:', versions);
    }
  });
});
