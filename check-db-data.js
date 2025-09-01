import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function checkData() {
  try {
    console.log("🔍 Checking database data...\n");

    // Check users
    const users = await prisma.user.findMany();
    console.log("👤 Users:", users.length);
    users.forEach((user) => {
      console.log(`  - ${user.email} (ID: ${user.id})`);
    });

    // Check folders
    const folders = await prisma.folder.findMany({
      include: {
        user: true,
      },
    });
    console.log("\n📁 Folders:", folders.length);
    folders.forEach((folder) => {
      console.log(
        `  - ${folder.name} (ID: ${folder.id}, User: ${folder.user.email})`,
      );
    });

    // Check messages
    const messages = await prisma.message.findMany({
      include: {
        user: true,
        folder: true,
      },
    });
    console.log("\n📧 Messages:", messages.length);
    messages.forEach((message) => {
      console.log(
        `  - ID: ${message.id}, Subject: ${message.subject}, User: ${message.user.email}, Folder: ${message.folder?.name || "None"}`,
      );
    });
  } catch (error) {
    console.error("Error:", error);
  } finally {
    await prisma.$disconnect();
  }
}

checkData();
