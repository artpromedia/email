#!/usr/bin/env tsx

/**
 * Test script to verify audit instrumentation is working correctly
 *
 * This script simulates the admin mutations mentioned in the requirements:
 * - PATCH /admin/users/:id → "user.update"
 * - POST /admin/users/:id/reset-password → "user.reset_password"
 * - PATCH /admin/users/:id {enabled:false|true} → "user.enable" or "user.disable"
 * - PATCH /admin/users/:id {role:'admin'|'user'} → "user.role_change"
 * - PUT /admin/policies/password → "policy.password.save"
 * - PUT /admin/policies/mfa → "policy.mfa.save"
 * - PUT /admin/policies/external-banner → "policy.banner.save"
 * - POST/DELETE /admin/policies/trusted-senders → "policy.trusted_senders.change"
 */

import { PrismaClient } from "@prisma/client";
import { initializeAuditLogger, logAudit } from "./src/utils/audit-logger";

const prisma = new PrismaClient();

async function main() {
  console.log("🧪 Testing audit instrumentation...\n");

  // Initialize audit logger
  initializeAuditLogger(prisma);

  // Create a test admin user for audit testing
  let testAdmin;
  try {
    testAdmin = await prisma.user.upsert({
      where: { email: "test-admin@ceerion.com" },
      update: {},
      create: {
        email: "test-admin@ceerion.com",
        name: "Test Admin",
        isAdmin: true,
        passwordHash: "test-hash",
      },
    });
    console.log(`✅ Test admin user ready: ${testAdmin.id}`);
  } catch (error) {
    console.error("❌ Failed to create test admin user:", error);
    return;
  }

  // Create a test regular user to be modified
  let testUser;
  try {
    testUser = await prisma.user.upsert({
      where: { email: "test-user@ceerion.com" },
      update: {},
      create: {
        email: "test-user@ceerion.com",
        name: "Test User",
        isAdmin: false,
        passwordHash: "test-hash",
      },
    });
    console.log(`✅ Test user ready: ${testUser.id}`);
  } catch (error) {
    console.error("❌ Failed to create test user:", error);
    return;
  }

  // Test 1: User update (PATCH /admin/users/:id)
  console.log("\n🔍 Test 1: User general update (user.update)");
  try {
    await logAudit({
      actorId: testAdmin.id,
      actorEmail: testAdmin.email,
      action: "user.update",
      resourceType: "user",
      resourceId: testUser.id,
      result: "SUCCESS",
      ip: "127.0.0.1",
      userAgent: "test-agent",
      metadata: {
        targetUser: testUser.email,
        changedFields: {
          name: { from: "Test User", to: "Updated Test User" },
          email: {
            from: "test-user@ceerion.com",
            to: "updated-user@ceerion.com",
          },
        },
      },
    });
    console.log("✅ User update audit logged successfully");
  } catch (error) {
    console.error("❌ Failed to log user update audit:", error);
  }

  // Test 2: Password reset (POST /admin/users/:id/reset-password)
  console.log("\n🔍 Test 2: Password reset (user.reset_password)");
  try {
    await logAudit({
      actorId: testAdmin.id,
      actorEmail: testAdmin.email,
      action: "user.reset_password",
      resourceType: "user",
      resourceId: testUser.id,
      result: "SUCCESS",
      ip: "127.0.0.1",
      userAgent: "test-agent",
      metadata: {
        targetUser: testUser.email,
        resetMethod: "admin_initiated",
      },
    });
    console.log("✅ Password reset audit logged successfully");
  } catch (error) {
    console.error("❌ Failed to log password reset audit:", error);
  }

  // Test 3: User enable/disable (PATCH /admin/users/:id {enabled})
  console.log("\n🔍 Test 3: User disable (user.disable)");
  try {
    await logAudit({
      actorId: testAdmin.id,
      actorEmail: testAdmin.email,
      action: "user.disable",
      resourceType: "user",
      resourceId: testUser.id,
      result: "SUCCESS",
      ip: "127.0.0.1",
      userAgent: "test-agent",
      metadata: {
        targetUser: testUser.email,
        previousStatus: "active",
        newStatus: "suspended",
      },
    });
    console.log("✅ User disable audit logged successfully");
  } catch (error) {
    console.error("❌ Failed to log user disable audit:", error);
  }

  // Test 4: User role change (PATCH /admin/users/:id {role})
  console.log("\n🔍 Test 4: User role change (user.role_change)");
  try {
    await logAudit({
      actorId: testAdmin.id,
      actorEmail: testAdmin.email,
      action: "user.role_change",
      resourceType: "user",
      resourceId: testUser.id,
      result: "SUCCESS",
      ip: "127.0.0.1",
      userAgent: "test-agent",
      metadata: {
        targetUser: testUser.email,
        previousRole: "user",
        newRole: "admin",
      },
    });
    console.log("✅ User role change audit logged successfully");
  } catch (error) {
    console.error("❌ Failed to log user role change audit:", error);
  }

  // Test 5: Password policy save (PUT /admin/policies/password)
  console.log("\n🔍 Test 5: Password policy save (policy.password.save)");
  try {
    await logAudit({
      actorId: testAdmin.id,
      actorEmail: testAdmin.email,
      action: "policy.password.save",
      resourceType: "policy",
      resourceId: "password-policy-id",
      result: "SUCCESS",
      ip: "127.0.0.1",
      userAgent: "test-agent",
      metadata: {
        policySettings: {
          minLength: 12,
          requireUppercase: true,
          requireLowercase: true,
          requireNumbers: true,
          requireSpecialChars: true,
          maxAge: 90,
        },
      },
    });
    console.log("✅ Password policy save audit logged successfully");
  } catch (error) {
    console.error("❌ Failed to log password policy save audit:", error);
  }

  // Test 6: MFA policy save (PUT /admin/policies/mfa)
  console.log("\n🔍 Test 6: MFA policy save (policy.mfa.save)");
  try {
    await logAudit({
      actorId: testAdmin.id,
      actorEmail: testAdmin.email,
      action: "policy.mfa.save",
      resourceType: "policy",
      resourceId: "mfa-policy-id",
      result: "SUCCESS",
      ip: "127.0.0.1",
      userAgent: "test-agent",
      metadata: {
        policySettings: {
          required: true,
          allowSMS: false,
          allowTOTP: true,
          backupCodes: true,
        },
      },
    });
    console.log("✅ MFA policy save audit logged successfully");
  } catch (error) {
    console.error("❌ Failed to log MFA policy save audit:", error);
  }

  // Test 7: Banner policy save (PUT /admin/policies/external-banner)
  console.log("\n🔍 Test 7: Banner policy save (policy.banner.save)");
  try {
    await logAudit({
      actorId: testAdmin.id,
      actorEmail: testAdmin.email,
      action: "policy.banner.save",
      resourceType: "policy",
      resourceId: "banner-policy-id",
      result: "SUCCESS",
      ip: "127.0.0.1",
      userAgent: "test-agent",
      metadata: {
        policySettings: {
          enabled: true,
          message: "This is an external email",
          backgroundColor: "#ff6b35",
          textColor: "#ffffff",
        },
      },
    });
    console.log("✅ Banner policy save audit logged successfully");
  } catch (error) {
    console.error("❌ Failed to log banner policy save audit:", error);
  }

  // Test 8: Trusted senders change (POST /admin/policies/trusted-senders)
  console.log(
    "\n🔍 Test 8: Trusted senders add (policy.trusted_senders.change)",
  );
  try {
    await logAudit({
      actorId: testAdmin.id,
      actorEmail: testAdmin.email,
      action: "policy.trusted_senders.change",
      resourceType: "policy",
      resourceId: "trusted-sender-id",
      result: "SUCCESS",
      ip: "127.0.0.1",
      userAgent: "test-agent",
      metadata: {
        operation: "add",
        senderData: {
          email: "trusted@partner.com",
          domain: "partner.com",
        },
      },
    });
    console.log("✅ Trusted senders add audit logged successfully");
  } catch (error) {
    console.error("❌ Failed to log trusted senders add audit:", error);
  }

  // Test 9: Trusted senders remove (DELETE /admin/policies/trusted-senders/:id)
  console.log(
    "\n🔍 Test 9: Trusted senders remove (policy.trusted_senders.change)",
  );
  try {
    await logAudit({
      actorId: testAdmin.id,
      actorEmail: testAdmin.email,
      action: "policy.trusted_senders.change",
      resourceType: "policy",
      resourceId: "trusted-sender-id",
      result: "SUCCESS",
      ip: "127.0.0.1",
      userAgent: "test-agent",
      metadata: {
        operation: "remove",
        deletedSender: {
          email: "trusted@partner.com",
          domain: "partner.com",
        },
      },
    });
    console.log("✅ Trusted senders remove audit logged successfully");
  } catch (error) {
    console.error("❌ Failed to log trusted senders remove audit:", error);
  }

  // Query recent audit events to verify they were logged
  console.log("\n📊 Recent audit events:");
  try {
    const recentEvents = await prisma.auditEvent.findMany({
      where: {
        actorId: testAdmin.id,
        createdAt: {
          gte: new Date(Date.now() - 60000), // Last minute
        },
      },
      orderBy: { createdAt: "desc" },
      take: 20,
    });

    if (recentEvents.length === 0) {
      console.log("⚠️  No recent audit events found");
    } else {
      console.log(`✅ Found ${recentEvents.length} recent audit events:`);
      recentEvents.forEach((event, index) => {
        console.log(
          `  ${index + 1}. [${event.createdAt.toISOString()}] ${event.action} → ${event.result} (${event.resourceType}:${event.resourceId})`,
        );
      });
    }
  } catch (error) {
    console.error("❌ Failed to query recent audit events:", error);
  }

  console.log("\n🎉 Audit instrumentation test completed!");
}

main()
  .catch((error) => {
    console.error("💥 Test failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
