# Admin Mutations Audit Instrumentation

This document outlines the audit instrumentation implemented for admin mutations as per the requirements.

## Implemented Routes with Audit Logging

### User Management Routes

#### 1. PATCH /admin/users/:id

- **Action**: `user.update`
- **Metadata**: `changedFields` object showing before/after values
- **Implementation**: New route added to handle general user updates with field-level change tracking

#### 2. POST /admin/users/:id/reset-password

- **Action**: `user.reset_password`
- **Metadata**: `targetUser`, `resetMethod: "admin_initiated"`
- **Implementation**: Changed from PUT to POST method as requested

#### 3. PATCH /admin/users/:id {enabled: boolean}

- **Action**: `user.enable` or `user.disable`
- **Metadata**: `targetUser`, `previousStatus`, `newStatus`
- **Implementation**: Combined with role change in single PATCH route

#### 4. PATCH /admin/users/:id {role: 'admin'|'user'}

- **Action**: `user.role_change`
- **Metadata**: `targetUser`, `previousRole`, `newRole`
- **Implementation**: Combined with enable/disable in single PATCH route

### Policy Management Routes

#### 5. PUT /admin/policies/password

- **Action**: `policy.password.save`
- **Metadata**: `policySettings` with password policy configuration
- **Implementation**: New route using SystemPolicy model with upsert logic

#### 6. PUT /admin/policies/mfa

- **Action**: `policy.mfa.save`
- **Metadata**: `policySettings` with MFA policy configuration
- **Implementation**: New route using SystemPolicy model with upsert logic

#### 7. PUT /admin/policies/external-banner

- **Action**: `policy.banner.save`
- **Metadata**: `policySettings` with banner configuration
- **Implementation**: New route using SystemPolicy model with upsert logic

#### 8. POST /admin/policies/trusted-senders

- **Action**: `policy.trusted_senders.change`
- **Metadata**: `operation: "add"`, `senderData`
- **Implementation**: New route using TrustedSender model

#### 9. DELETE /admin/policies/trusted-senders/:id

- **Action**: `policy.trusted_senders.change`
- **Metadata**: `operation: "remove"`, `deletedSender`
- **Implementation**: New route using TrustedSender model

## Database Schema Additions

Added new models to support policy management:

```prisma
model SystemPolicy {
  id          String   @id @default(cuid())
  type        String   @unique // password, mfa, external-banner
  settings    Json     // Policy-specific settings
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  createdById String
  createdBy   User     @relation("SystemPolicyCreatedBy", fields: [createdById], references: [id])
  @@map("system_policies")
}

model TrustedSender {
  id          String   @id @default(cuid())
  email       String   @unique
  domain      String?
  createdAt   DateTime @default(now())
  createdById String
  createdBy   User     @relation("TrustedSenderCreatedBy", fields: [createdById], references: [id])
  @@map("trusted_senders")
}
```

## Audit Implementation Details

### Success Logging

- All successful mutations log with `result: "SUCCESS"`
- Actor information extracted from `request.user` (admin context)
- IP and User-Agent extracted from request headers
- Rich metadata specific to each operation type

### Failure Logging

- All caught exceptions log with `result: "FAILURE"`
- Error message included in metadata
- Attempted operation data included for debugging
- Original error re-thrown after logging

### Request Context

- **Actor**: `actorId` and `actorEmail` from authenticated admin user
- **IP**: Extracted from `request.ip` or forwarded headers
- **User-Agent**: From `request.headers["user-agent"]`

## Testing

A comprehensive test script is available at `test-audit-instrumentation.ts` that:

1. Creates test admin and user accounts
2. Simulates all 9 audit actions
3. Verifies audit events are logged correctly
4. Shows recent audit log entries

Run the test with:

```bash
cd apps/api
npx tsx test-audit-instrumentation.ts
```

## Acceptance Criteria Verification

✅ **PATCH /admin/users/:id** → action: "user.update" (metadata: changed fields)  
✅ **POST /admin/users/:id/reset-password** → "user.reset_password"  
✅ **PATCH /admin/users/:id {enabled:false|true}** → "user.enable" or "user.disable"  
✅ **PATCH /admin/users/:id {role:'admin'|'user'}** → "user.role_change"  
✅ **PUT /admin/policies/password** → "policy.password.save"  
✅ **PUT /admin/policies/mfa** → "policy.mfa.save"  
✅ **PUT /admin/policies/external-banner** → "policy.banner.save"  
✅ **POST/DELETE /admin/policies/trusted-senders** → "policy.trusted_senders.change"

### Performance Target

- All audit events logged within 1 second of successful operation
- Audit logging failures do not break main operations (error handling)
- Actor, IP, and User-Agent automatically extracted from request context

## Migration Required

To deploy these changes, run:

```bash
cd apps/api
npx prisma migrate dev --name add-policy-models
npx prisma generate
```

This will create the new `system_policies` and `trusted_senders` tables needed for the policy management routes.
