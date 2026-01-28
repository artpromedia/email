/**
 * Enterprise Email Database - Migration Utilities
 * Drizzle Kit migration helpers
 */

import path from "path";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { createConnection, createDrizzle, closeConnection } from "./client";

// ============================================================
// MIGRATION CONFIGURATION
// ============================================================

export interface MigrationConfig {
  /** Directory containing migration files */
  migrationsFolder: string;
  /** Table to track migrations */
  migrationsTable: string;
  /** Schema to use for migrations */
  migrationsSchema: string;
}

export function getDefaultMigrationConfig(): MigrationConfig {
  return {
    migrationsFolder: path.resolve(__dirname, "../drizzle"),
    migrationsTable: "__drizzle_migrations",
    migrationsSchema: "public",
  };
}

// ============================================================
// MIGRATION FUNCTIONS
// ============================================================

/**
 * Run all pending migrations
 */
export async function runMigrations(config?: Partial<MigrationConfig>): Promise<void> {
  const fullConfig = { ...getDefaultMigrationConfig(), ...config };

  console.info("🚀 Starting database migrations...");
  console.info(`📁 Migrations folder: ${fullConfig.migrationsFolder}`);

  const connection = createConnection();
  const db = createDrizzle(connection);

  try {
    await migrate(db, {
      migrationsFolder: fullConfig.migrationsFolder,
      migrationsTable: fullConfig.migrationsTable,
      migrationsSchema: fullConfig.migrationsSchema,
    });

    console.info("✅ Migrations completed successfully!");
  } catch (error) {
    console.error("❌ Migration failed:", error);
    throw error;
  } finally {
    await connection.end();
  }
}

/**
 * Check migration status
 */
export async function getMigrationStatus(): Promise<{
  applied: string[];
  pending: string[];
}> {
  const connection = createConnection();

  try {
    // Check if migrations table exists
    const tableExists = await connection`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = '__drizzle_migrations'
      )
    `;

    if (!tableExists[0]?.["exists"]) {
      return { applied: [], pending: ["(no migrations table found)"] };
    }

    // Get applied migrations
    const applied = await connection`
      SELECT hash, created_at
      FROM __drizzle_migrations
      ORDER BY created_at ASC
    `;

    return {
      applied: applied.map((m) => m["hash"] as string),
      pending: [], // Would need to scan migrations folder to determine pending
    };
  } finally {
    await connection.end();
  }
}

/**
 * Reset database (DROP ALL TABLES) - USE WITH CAUTION
 */
export async function resetDatabase(): Promise<void> {
  if (process.env["NODE_ENV"] === "production") {
    throw new Error("Cannot reset database in production environment!");
  }

  console.warn("⚠️  Resetting database - this will delete all data!");

  const connection = createConnection();

  try {
    // Drop all tables in public schema
    await connection`
      DO $$ DECLARE
        r RECORD;
      BEGIN
        FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public') LOOP
          EXECUTE 'DROP TABLE IF EXISTS ' || quote_ident(r.tablename) || ' CASCADE';
        END LOOP;
      END $$;
    `;

    // Drop all custom types/enums
    await connection`
      DO $$ DECLARE
        r RECORD;
      BEGIN
        FOR r IN (SELECT typname FROM pg_type WHERE typnamespace = 'public'::regnamespace AND typtype = 'e') LOOP
          EXECUTE 'DROP TYPE IF EXISTS ' || quote_ident(r.typname) || ' CASCADE';
        END LOOP;
      END $$;
    `;

    console.info("✅ Database reset completed!");
  } finally {
    await connection.end();
  }
}

// ============================================================
// CLI ENTRY POINT
// ============================================================

async function main() {
  const command = process.argv[2];

  switch (command) {
    case "run":
      await runMigrations();
      break;

    case "status": {
      const status = await getMigrationStatus();
      console.info("Applied migrations:", status.applied.length);
      status.applied.forEach((m) => console.info(`  ✔ ${m}`));
      if (status.pending.length > 0) {
        console.info("Pending migrations:", status.pending.length);
        status.pending.forEach((m) => console.info(`  ○ ${m}`));
      }
      break;
    }

    case "reset":
      if (process.argv[3] !== "--force") {
        console.warn("⚠️  This will delete all data! Use --force to confirm.");
        process.exit(1);
      }
      await resetDatabase();
      break;

    default:
      console.info("Usage: pnpm db:migrate [run|status|reset]");
      console.info("  run    - Run pending migrations");
      console.info("  status - Show migration status");
      console.info("  reset  - Reset database (requires --force)");
      process.exit(1);
  }

  await closeConnection();
}

// Run if called directly
if (require.main === module) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}
