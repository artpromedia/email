import { PrismaClient } from "@prisma/client";
import * as argon2 from "argon2";

const prisma = new PrismaClient();

async function createDemoUser() {
  try {
    // Check if demo user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: "demo@ceerion.com" },
    });

    if (existingUser) {
      console.log("Demo user already exists");
      return;
    }

    // Create demo user
    const hashedPassword = await argon2.hash("demo", {
      type: argon2.argon2id,
      memoryCost: 2 ** 16, // 64 MB
      timeCost: 3,
      parallelism: 1,
    });

    const user = await prisma.user.create({
      data: {
        email: "demo@ceerion.com",
        name: "Demo User",
        passwordHash: hashedPassword,
      },
    });

    console.log("Demo user created:", user.email);
  } catch (error) {
    console.error("Error creating demo user:", error);
  } finally {
    await prisma.$disconnect();
  }
}

createDemoUser();
