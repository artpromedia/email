#!/usr/bin/env tsx

/**
 * Seed script to populate audit events for testing the /audit page
 * 
 * This creates realistic audit data that demonstrates all the instrumented
 * admin mutations working correctly with the audit page UI.
 */

import { PrismaClient } from "@prisma/client";
import { initializeAuditLogger, logAudit } from "./src/utils/audit-logger";

const prisma = new PrismaClient();

// Sample data generators
const actions = [
  "user.update",
  "user.reset_password", 
  "user.enable",
  "user.disable",
  "user.role_change",
  "policy.password.save",
  "policy.mfa.save",
  "policy.banner.save",
  "policy.trusted_senders.change",
  "auth.login",
  "auth.logout",
];

const resourceTypes = ["user", "policy", "session"];
const results: ("SUCCESS" | "FAILURE")[] = ["SUCCESS", "SUCCESS", "SUCCESS", "FAILURE"]; // 75% success rate
const userAgents = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:89.0) Gecko/20100101 Firefox/89.0",
];

const ipAddresses = [
  "192.168.1.100",
  "10.0.0.50", 
  "172.16.0.25",
  "203.0.113.42",
  "198.51.100.123",
];

function randomChoice<T>(array: T[]): T {
  return array[Math.floor(Math.random() * array.length)];
}

function randomDate(daysAgo: number = 30): Date {
  const now = new Date();
  const past = new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000);
  return new Date(past.getTime() + Math.random() * (now.getTime() - past.getTime()));
}

async function main() {
  console.log("🌱 Seeding audit events...\n");

  // Initialize audit logger
  initializeAuditLogger(prisma);

  // Create test admin users
  const adminUsers = [];
  for (let i = 1; i <= 3; i++) {
    const admin = await prisma.user.upsert({
      where: { email: `admin${i}@ceerion.com` },
      update: {},
      create: {
        email: `admin${i}@ceerion.com`,
        name: `Admin User ${i}`,
        isAdmin: true,
        passwordHash: "test-hash",
      },
    });
    adminUsers.push(admin);
  }

  // Create test regular users  
  const regularUsers = [];
  for (let i = 1; i <= 5; i++) {
    const user = await prisma.user.upsert({
      where: { email: `user${i}@ceerion.com` },
      update: {},
      create: {
        email: `user${i}@ceerion.com`,
        name: `Test User ${i}`,
        isAdmin: false,
        passwordHash: "test-hash",
      },
    });
    regularUsers.push(user);
  }

  console.log(`✅ Created ${adminUsers.length} admin users and ${regularUsers.length} regular users`);

  // Generate realistic audit events
  const eventsToCreate = 150; // Generate 150 events over the past 30 days
  
  for (let i = 0; i < eventsToCreate; i++) {
    const actor = randomChoice(adminUsers);
    const action = randomChoice(actions);
    const resourceType = randomChoice(resourceTypes);
    const result = randomChoice(results);
    const ip = randomChoice(ipAddresses);
    const userAgent = randomChoice(userAgents);
    const timestamp = randomDate(30);

    // Generate action-specific metadata
    let metadata: Record<string, any> = {};
    let resourceId: string | null = null;

    switch (action) {
      case "user.update":
        const targetUser = randomChoice(regularUsers);
        resourceId = targetUser.id;
        metadata = {
          targetUser: targetUser.email,
          changedFields: {
            name: { from: "Old Name", to: "New Name" },
            email: { from: "old@example.com", to: targetUser.email },
          },
        };
        break;

      case "user.reset_password":
        const passwordUser = randomChoice(regularUsers);
        resourceId = passwordUser.id;
        metadata = {
          targetUser: passwordUser.email,
          resetMethod: "admin_initiated",
        };
        break;

      case "user.enable":
      case "user.disable":
        const statusUser = randomChoice(regularUsers);
        resourceId = statusUser.id;
        metadata = {
          targetUser: statusUser.email,
          previousStatus: action === "user.enable" ? "suspended" : "active",
          newStatus: action === "user.enable" ? "active" : "suspended",
        };
        break;

      case "user.role_change":
        const roleUser = randomChoice(regularUsers);
        resourceId = roleUser.id;
        metadata = {
          targetUser: roleUser.email,
          previousRole: "user",
          newRole: Math.random() > 0.5 ? "admin" : "user",
        };
        break;

      case "policy.password.save":
        resourceId = "password-policy";
        metadata = {
          policySettings: {
            minLength: 12,
            requireUppercase: true,
            requireLowercase: true,
            requireNumbers: true,
            requireSpecialChars: true,
            maxAge: 90,
          },
        };
        break;

      case "policy.mfa.save":
        resourceId = "mfa-policy";
        metadata = {
          policySettings: {
            required: Math.random() > 0.5,
            allowSMS: Math.random() > 0.5,
            allowTOTP: true,
            backupCodes: true,
          },
        };
        break;

      case "policy.banner.save":
        resourceId = "banner-policy";
        metadata = {
          policySettings: {
            enabled: Math.random() > 0.3,
            message: "This is an external email",
            backgroundColor: "#ff6b35",
            textColor: "#ffffff",
          },
        };
        break;

      case "policy.trusted_senders.change":
        resourceId = `trusted-sender-${Math.random().toString(36).substr(2, 9)}`;
        metadata = {
          operation: Math.random() > 0.5 ? "add" : "remove",
          senderData: {
            email: `trusted${i}@partner.com`,
            domain: "partner.com",
          },
        };
        break;

      case "auth.login":
      case "auth.logout":
        resourceType = "session";
        resourceId = `session-${Math.random().toString(36).substr(2, 9)}`;
        metadata = {
          method: "password",
          remember: Math.random() > 0.5,
        };
        break;

      default:
        resourceId = `resource-${Math.random().toString(36).substr(2, 9)}`;
        metadata = { operation: "general" };
    }

    // Add error details for failed events
    if (result === "FAILURE") {
      metadata.error = randomChoice([
        "User not found",
        "Permission denied", 
        "Validation failed",
        "Database connection error",
        "Rate limit exceeded",
      ]);
    }

    // Create the audit event directly in the database with custom timestamp
    await prisma.auditEvent.create({
      data: {
        actorId: actor.id,
        actorEmail: actor.email,
        action,
        resourceType,
        resourceId,
        result,
        ip,
        userAgent,
        metadata,
        ts: timestamp, // Use our custom timestamp
      },
    });

    if ((i + 1) % 25 === 0) {
      console.log(`📝 Created ${i + 1}/${eventsToCreate} audit events...`);
    }
  }

  console.log(`\n✅ Successfully created ${eventsToCreate} audit events!`);

  // Show some statistics
  const stats = await prisma.auditEvent.groupBy({
    by: ['action', 'result'],
    _count: true,
    orderBy: {
      _count: {
        action: 'desc'
      }
    }
  });

  console.log("\n📊 Audit Event Statistics:");
  console.log("Action | Result | Count");
  console.log("-------|--------|------");
  stats.forEach(stat => {
    console.log(`${stat.action.padEnd(25)} | ${stat.result.padEnd(7)} | ${stat._count}`);
  });

  const totalEvents = await prisma.auditEvent.count();
  console.log(`\n🎯 Total audit events in database: ${totalEvents}`);
  console.log("🚀 Audit page is ready for testing!");
}
        ip: "192.168.1.102",
        userAgent: "curl/7.81.0",
        metadata: {
          domain: "example.com",
          selector: "default",
          keyLength: 2048,
        },
      },
    ];

    for (const event of sampleEvents) {
      await auditLogger.logAudit(event);
      console.log(
        `✅ Created audit event: ${event.action} on ${event.resourceType}`,
      );
    }

    console.log("🎉 Successfully seeded 5 audit events!");

    // Display some stats
    const total = await prisma.auditEvent.count();
    const successCount = await prisma.auditEvent.count({
      where: { result: "SUCCESS" },
    });
main()
  .catch((error) => {
    console.error("💥 Seeding failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
