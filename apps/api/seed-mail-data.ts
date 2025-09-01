import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function seedMailData() {
  console.log("🌱 Seeding mail data...");

  // Create demo user if it doesn't exist
  const demoUser = await prisma.user.upsert({
    where: { email: "demo@ceerion.com" },
    update: {},
    create: {
      email: "demo@ceerion.com",
      name: "Demo User",
      emailVerified: true,
    },
  });

  console.log(`✅ Demo user: ${demoUser.email}`);

  // Create default folders
  const defaultFolders = [
    { name: "Inbox", type: "inbox" },
    { name: "Sent", type: "sent" },
    { name: "Drafts", type: "drafts" },
    { name: "Trash", type: "trash" },
    { name: "Spam", type: "spam" },
    { name: "Archive", type: "archive" },
  ];

  for (const folderData of defaultFolders) {
    // Use any type to bypass TypeScript error until Prisma client is properly generated
    const folder = await (prisma as any).folder.upsert({
      where: {
        userId_name: {
          userId: demoUser.id,
          name: folderData.name,
        },
      },
      update: {},
      create: {
        userId: demoUser.id,
        name: folderData.name,
        type: folderData.type,
      },
    });
    console.log(`📁 Created folder: ${folder.name}`);
  }

  // Get the inbox folder
  const inboxFolder = await (prisma as any).folder.findFirst({
    where: {
      userId: demoUser.id,
      name: "Inbox",
    },
  });

  if (!inboxFolder) {
    throw new Error("Inbox folder not found");
  }

  // Create sample messages
  const sampleMessages = [
    {
      messageId: "msg-1@example.com",
      from: "john.doe@example.com",
      to: ["demo@ceerion.com"],
      subject: "Welcome to CEERION Mail",
      body: "Welcome to CEERION Mail! This is your first message.",
      htmlBody:
        "<h1>Welcome to CEERION Mail!</h1><p>This is your first message.</p>",
      sentAt: new Date("2025-08-30T10:00:00Z"),
      receivedAt: new Date("2025-08-30T10:00:00Z"),
    },
    {
      messageId: "msg-2@example.com",
      from: "jane.smith@example.com",
      to: ["demo@ceerion.com"],
      subject: "Meeting Tomorrow",
      body: "Hi, just a reminder about our meeting tomorrow at 2 PM.",
      htmlBody:
        "<p>Hi,</p><p>Just a reminder about our meeting tomorrow at 2 PM.</p>",
      sentAt: new Date("2025-08-30T14:30:00Z"),
      receivedAt: new Date("2025-08-30T14:30:00Z"),
    },
    {
      messageId: "msg-3@example.com",
      from: "newsletter@tech.com",
      to: ["demo@ceerion.com"],
      subject: "Weekly Tech Newsletter",
      body: "Check out this week's top tech stories...",
      htmlBody:
        "<h2>Weekly Tech Newsletter</h2><p>Check out this week's top tech stories...</p>",
      sentAt: new Date("2025-08-31T09:00:00Z"),
      receivedAt: new Date("2025-08-31T09:00:00Z"),
    },
  ];

  for (const messageData of sampleMessages) {
    const message = await prisma.message.upsert({
      where: { messageId: messageData.messageId },
      update: {},
      create: {
        ...messageData,
        userId: demoUser.id,
        ...(inboxFolder?.id && { folderId: inboxFolder.id }),
        folder: "inbox", // Keep for backward compatibility
      } as any,
    });
    console.log(`📧 Created message: ${message.subject}`);
  }

  console.log("✅ Mail data seeding completed");
}

seedMailData()
  .catch((e) => {
    console.error("❌ Error seeding mail data:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
