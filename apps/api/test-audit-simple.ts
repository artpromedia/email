import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function testAuditSystem() {
  try {
    console.log("🔧 Testing audit system...");

    // Create a test admin user
    const testUser = await prisma.user.upsert({
      where: { id: "1" },
      update: { isAdmin: true },
      create: {
        id: "1",
        email: "demo@ceerion.com",
        name: "Demo Admin User",
        passwordHash: "dummy-hash",
        isAdmin: true,
      },
    });

    // Create sample audit events
    const auditEvents = [
      {
        actorId: testUser.id,
        actorEmail: testUser.email,
        action: "user.role.change",
        resourceType: "USER",
        resourceId: testUser.id,
        result: "SUCCESS",
        ip: "127.0.0.1",
        userAgent: "admin-frontend",
        metadata: {
          oldRole: "user",
          newRole: "admin",
        },
      },
      {
        actorId: testUser.id,
        actorEmail: testUser.email,
        action: "policy.password.save",
        resourceType: "POLICY",
        resourceId: "policy-1",
        result: "SUCCESS",
        ip: "127.0.0.1",
        userAgent: "admin-frontend",
        metadata: {
          minLength: 8,
          requireUppercase: true,
        },
      },
    ];

    for (const event of auditEvents) {
      await prisma.auditEvent.create({
        data: event,
      });
      console.log(`✅ Created audit event: ${event.action}`);
    }

    // Check total audit events
    const total = await prisma.auditEvent.count();
    console.log(`\n📊 Total audit events: ${total}`);

    // Test API endpoint directly
    console.log("\n🌐 Testing API endpoint...");
  } catch (error) {
    console.error("❌ Error:", error);
  } finally {
    await prisma.$disconnect();
  }
}

testAuditSystem();
