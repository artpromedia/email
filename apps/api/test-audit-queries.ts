import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function testAuditQueries() {
  console.log("🧪 Testing audit system queries...");

  try {
    // Test 1: Get all audit events
    const allEvents = await prisma.auditEvent.findMany({
      orderBy: { ts: "desc" },
      take: 5,
      include: {
        actor: {
          select: { id: true, email: true, name: true },
        },
      },
    });

    console.log(`✅ Found ${allEvents.length} audit events`);

    // Test 2: Filter by action
    const userActions = await prisma.auditEvent.findMany({
      where: {
        action: { contains: "user." },
      },
      take: 3,
    });

    console.log(`✅ Found ${userActions.length} user-related actions`);

    // Test 3: Filter by result
    const successfulEvents = await prisma.auditEvent.count({
      where: { result: "SUCCESS" },
    });

    const failedEvents = await prisma.auditEvent.count({
      where: { result: "FAILURE" },
    });

    console.log(
      `✅ Success events: ${successfulEvents}, Failed events: ${failedEvents}`,
    );

    // Test 4: Filter by resource type
    const policyEvents = await prisma.auditEvent.findMany({
      where: { resourceType: "policy" },
      take: 3,
    });

    console.log(`✅ Found ${policyEvents.length} policy-related events`);

    // Test 5: Complex query with multiple filters
    const complexQuery = await prisma.auditEvent.findMany({
      where: {
        AND: [
          { result: "SUCCESS" },
          { resourceType: "user" },
          {
            ts: {
              gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // Last 7 days
            },
          },
        ],
      },
      orderBy: { ts: "desc" },
      take: 10,
    });

    console.log(`✅ Complex query returned ${complexQuery.length} events`);

    console.log("🎉 All audit queries working correctly!");

    // Sample export simulation
    console.log("\n📊 Sample CSV export format:");
    console.log(
      "ID,Timestamp,Actor Email,Action,Resource Type,Resource ID,Result,IP Address,User Agent,Metadata",
    );

    allEvents.slice(0, 2).forEach((event) => {
      const csvRow = [
        event.id,
        event.ts.toISOString(),
        event.actorEmail || "",
        event.action,
        event.resourceType,
        event.resourceId || "",
        event.result,
        event.ip || "",
        (event.userAgent || "").replace(/"/g, '""'),
        JSON.stringify(event.metadata || {}).replace(/"/g, '""'),
      ]
        .map((field) => `"${field}"`)
        .join(",");
      console.log(csvRow);
    });
  } catch (error) {
    console.error("❌ Audit system test failed:", error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run the test
if (require.main === module) {
  testAuditQueries().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

export { testAuditQueries };
