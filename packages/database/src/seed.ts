/**
 * OonruMail Database - Seed Data
 * Test data for development with multiple domains
 */

import { getDatabase, closeConnection } from "./client";
import {
  organizations,
  domains,
  domainDnsRecords,
  domainDkimKeys,
  domainSettings,
  users,
  userEmailAddresses,
  userDomainPermissions,
  mailboxes,
  folders,
  labels,
  sharedMailboxes,
  sharedMailboxMembers,
  distributionLists,
  distributionListMembers,
  domainRoutingRules,
  transportRules,
} from "./schema";
import type { DistributionListSettings } from "./schema/distribution-lists";
import type { DomainBranding, ContentFilterRule } from "./schema/domains";
import type { MailboxSettings } from "./schema/mailboxes";
import type { OrganizationSettings } from "./schema/organizations";

// ============================================================
// SEED DATA CONFIGURATION
// ============================================================

const SEED_CONFIG = {
  // Organization
  organization: {
    name: "Acme Corporation",
    slug: "acme-corp",
    maxDomains: 10,
    maxUsers: 100,
    storageQuotaBytes: "107374182400", // 100 GB as string for bigint
  },

  // Domains to create
  domains: [
    {
      domainName: "acme.com",
      displayName: "Acme Corporation",
      isPrimary: true,
      branding: {
        primaryColor: "#1a56db",
        secondaryColor: "#9061f9",
        accentColor: "#f59e0b",
        logoUrl: "https://acme.com/logo.png",
        logoDarkUrl: "https://acme.com/logo-dark.png",
        faviconUrl: "https://acme.com/favicon.ico",
        loginBackgroundUrl: null,
        customCss: null,
      } satisfies DomainBranding,
    },
    {
      domainName: "acme-support.com",
      displayName: "Acme Support",
      isPrimary: false,
      branding: {
        primaryColor: "#059669",
        secondaryColor: "#10b981",
        accentColor: "#f59e0b",
        logoUrl: "https://acme-support.com/logo.png",
        logoDarkUrl: "https://acme-support.com/logo-dark.png",
        faviconUrl: "https://acme-support.com/favicon.ico",
        loginBackgroundUrl: null,
        customCss: null,
      } satisfies DomainBranding,
    },
    {
      domainName: "acme-dev.io",
      displayName: "Acme Development",
      isPrimary: false,
      branding: {
        primaryColor: "#7c3aed",
        secondaryColor: "#a78bfa",
        accentColor: "#f59e0b",
        logoUrl: "https://acme-dev.io/logo.png",
        logoDarkUrl: "https://acme-dev.io/logo-dark.png",
        faviconUrl: "https://acme-dev.io/favicon.ico",
        loginBackgroundUrl: null,
        customCss: null,
      } satisfies DomainBranding,
    },
  ],

  // Users to create (will have email on all domains)
  users: [
    {
      firstName: "John",
      lastName: "Smith",
      role: "admin" as const,
      title: "IT Administrator",
      department: "IT",
    },
    {
      firstName: "Sarah",
      lastName: "Johnson",
      role: "admin" as const,
      title: "CEO",
      department: "Executive",
    },
    {
      firstName: "Mike",
      lastName: "Williams",
      role: "member" as const,
      title: "Support Lead",
      department: "Support",
    },
    {
      firstName: "Emily",
      lastName: "Brown",
      role: "member" as const,
      title: "Developer",
      department: "Engineering",
    },
    {
      firstName: "David",
      lastName: "Wilson",
      role: "member" as const,
      title: "Sales Manager",
      department: "Sales",
    },
  ],
};

// ============================================================
// SEED FUNCTIONS
// ============================================================

async function seedOrganization(db: ReturnType<typeof getDatabase>) {
  console.info("📦 Seeding organization...");

  const orgSettings: OrganizationSettings = {
    defaultUserQuotaBytes: 5 * 1024 * 1024 * 1024, // 5 GB
    maxAttachmentSizeBytes: 25 * 1024 * 1024, // 25 MB
    requireTwoFactor: false,
    sessionTimeoutMinutes: 480, // 8 hours
    passwordPolicy: {
      minLength: 12,
      requireUppercase: true,
      requireLowercase: true,
      requireNumbers: true,
      requireSpecialChars: true,
      expirationDays: 90,
    },
    emailRetentionDays: 365, // 1 year
    allowedIpRanges: [],
    branding: {
      primaryColor: "#1a56db",
      logoUrl: "https://acme.com/logo.png",
      faviconUrl: null,
    },
  };

  const [org] = await db
    .insert(organizations)
    .values({
      name: SEED_CONFIG.organization.name,
      slug: SEED_CONFIG.organization.slug,
      settings: orgSettings,
      subscriptionTier: "enterprise",
      maxDomains: SEED_CONFIG.organization.maxDomains,
      maxUsers: SEED_CONFIG.organization.maxUsers,
      storageQuotaBytes: SEED_CONFIG.organization.storageQuotaBytes,
    })
    .returning();

  if (!org) throw new Error("Failed to create organization");

  console.info(`  ✓ Created organization: ${org.name} (${org.id})`);
  return org;
}

async function seedDomains(db: ReturnType<typeof getDatabase>, organizationId: string) {
  console.info("🌐 Seeding domains...");

  const createdDomains: (typeof domains.$inferSelect)[] = [];

  for (const domainConfig of SEED_CONFIG.domains) {
    const [domain] = await db
      .insert(domains)
      .values({
        organizationId,
        domainName: domainConfig.domainName,
        displayName: domainConfig.displayName,
        isPrimary: domainConfig.isPrimary,
        isVerified: true,
        verifiedAt: new Date(),
        status: "active",
        mxVerified: true,
        spfVerified: true,
        dkimVerified: true,
        dmarcVerified: true,
      })
      .returning();

    if (!domain) throw new Error(`Failed to create domain ${domainConfig.domainName}`);

    createdDomains.push(domain);

    // Add DNS records
    await db.insert(domainDnsRecords).values([
      {
        domainId: domain.id,
        recordType: "mx",
        recordName: domainConfig.domainName,
        recordValue: `10 mail.${domainConfig.domainName}`,
        isVerified: true,
      },
      {
        domainId: domain.id,
        recordType: "txt",
        recordName: domainConfig.domainName,
        recordValue: `v=spf1 include:_spf.${domainConfig.domainName} ~all`,
        isVerified: true,
      },
      {
        domainId: domain.id,
        recordType: "txt",
        recordName: `_dmarc.${domainConfig.domainName}`,
        recordValue: `v=DMARC1; p=quarantine; rua=mailto:dmarc@${domainConfig.domainName}`,
        isVerified: true,
      },
    ]);

    // Add DKIM key
    await db.insert(domainDkimKeys).values({
      domainId: domain.id,
      selector: "default",
      publicKey: `-----BEGIN PUBLIC KEY-----\nMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA...\n-----END PUBLIC KEY-----`,
      privateKeyEncrypted: "ENCRYPTED_PRIVATE_KEY_PLACEHOLDER",
      isActive: true,
    });

    // Add domain settings
    const contentRules: ContentFilterRule[] = [
      {
        id: "rule-1",
        name: "Block executable attachments",
        enabled: true,
        criteria: [
          {
            field: "subject",
            operator: "contains",
            value: ".exe",
            caseSensitive: false,
          },
        ],
        action: "reject",
        actionParams: { message: "Executable attachments not allowed" },
      },
    ];

    await db.insert(domainSettings).values({
      domainId: domain.id,
      branding: domainConfig.branding,
      contentFilterRules: contentRules,
    });

    console.info(`  ✓ Created domain: ${domain.domainName} (${domain.id})`);
  }

  return createdDomains;
}

async function seedUsers(
  db: ReturnType<typeof getDatabase>,
  organizationId: string,
  createdDomains: (typeof domains.$inferSelect)[]
) {
  console.info("👥 Seeding users...");

  const createdUsers: {
    user: typeof users.$inferSelect;
    mailboxes: (typeof mailboxes.$inferSelect)[];
  }[] = [];

  const primaryDomain = createdDomains.find((d) => d.isPrimary);
  if (!primaryDomain) throw new Error("No primary domain found");

  for (const userConfig of SEED_CONFIG.users) {
    const emailLocal = `${userConfig.firstName.toLowerCase()}.${userConfig.lastName.toLowerCase()}`;
    const primaryEmail = `${emailLocal}@${primaryDomain.domainName}`;

    // Create user
    const [user] = await db
      .insert(users)
      .values({
        organizationId,
        primaryEmail,
        primaryDomainId: primaryDomain.id,
        passwordHash: "$2b$10$PLACEHOLDER_HASH_FOR_DEVELOPMENT_ONLY",
        displayName: `${userConfig.firstName} ${userConfig.lastName}`,
        firstName: userConfig.firstName,
        lastName: userConfig.lastName,
        role: userConfig.role,
        status: "active",
        timezone: "America/New_York",
        language: "en",
      })
      .returning();

    if (!user) throw new Error(`Failed to create user ${primaryEmail}`);

    const userMailboxes: (typeof mailboxes.$inferSelect)[] = [];

    // Create email address and mailbox for each domain
    for (const domain of createdDomains) {
      const domainEmail = `${emailLocal}@${domain.domainName}`;

      // Create email address
      await db.insert(userEmailAddresses).values({
        userId: user.id,
        domainId: domain.id,
        emailAddress: domainEmail,
        localPart: emailLocal,
        isPrimary: domain.isPrimary,
        isVerified: true,
      });

      // Create mailbox settings
      const mailboxSettings: MailboxSettings = {
        signature: `<p>${user.displayName}</p>`,
        vacationEnabled: false,
        vacationStartDate: null,
        vacationEndDate: null,
        vacationSubject: null,
        vacationMessage: null,
        vacationOncePerSender: true,
        forwardingEnabled: false,
        forwardingAddress: null,
        forwardingKeepCopy: true,
        readReceipts: "never",
        defaultReplyBehavior: "reply",
        conversationViewEnabled: true,
        previewPanePosition: "right",
        messagesPerPage: 50,
      };

      const [mailbox] = await db
        .insert(mailboxes)
        .values({
          userId: user.id,
          domainId: domain.id,
          emailAddress: domainEmail,
          displayName: user.displayName,
          isPrimary: domain.isPrimary,
          quotaBytes: 5 * 1024 * 1024 * 1024,
          settings: mailboxSettings,
        })
        .returning();

      if (!mailbox) throw new Error(`Failed to create mailbox ${domainEmail}`);

      userMailboxes.push(mailbox);

      // Create default folders
      const systemFolders = [
        { name: "Inbox", path: "/Inbox", type: "inbox" as const, order: 0 },
        { name: "Sent", path: "/Sent", type: "sent" as const, order: 1 },
        { name: "Drafts", path: "/Drafts", type: "drafts" as const, order: 2 },
        { name: "Trash", path: "/Trash", type: "trash" as const, order: 3 },
        { name: "Spam", path: "/Spam", type: "spam" as const, order: 4 },
        { name: "Archive", path: "/Archive", type: "archive" as const, order: 5 },
      ];

      for (const folder of systemFolders) {
        await db.insert(folders).values({
          mailboxId: mailbox.id,
          name: folder.name,
          path: folder.path,
          folderType: "system",
          systemType: folder.type,
          sortOrder: folder.order,
          isSystem: true,
        });
      }

      // Create some labels
      await db.insert(labels).values([
        {
          mailboxId: mailbox.id,
          name: "Important",
          color: "#dc2626",
          sortOrder: 0,
        },
        {
          mailboxId: mailbox.id,
          name: "Work",
          color: "#2563eb",
          sortOrder: 1,
        },
        {
          mailboxId: mailbox.id,
          name: "Personal",
          color: "#16a34a",
          sortOrder: 2,
        },
      ]);

      console.info(`  ✓ Created mailbox: ${domainEmail}`);
    }

    // Add domain permissions
    for (const domain of createdDomains) {
      await db.insert(userDomainPermissions).values({
        userId: user.id,
        domainId: domain.id,
        canSendAs: true,
        canManage: userConfig.role === "admin",
        canViewAnalytics: userConfig.role === "admin",
        canManageUsers: userConfig.role === "admin",
      });
    }

    createdUsers.push({ user, mailboxes: userMailboxes });
    console.info(`  ✓ Created user: ${user.displayName} (${user.id})`);
  }

  return createdUsers;
}

async function seedSharedMailboxes(
  db: ReturnType<typeof getDatabase>,
  organizationId: string,
  createdDomains: (typeof domains.$inferSelect)[],
  createdUsers: {
    user: typeof users.$inferSelect;
    mailboxes: (typeof mailboxes.$inferSelect)[];
  }[]
) {
  console.info("📬 Seeding shared mailboxes...");

  const primaryDomain = createdDomains.find((d) => d.isPrimary);
  const supportDomain = createdDomains.find((d) => d.domainName.includes("support"));
  const adminUser = createdUsers.find((u) => u.user.role === "admin")?.user;

  if (!primaryDomain || !adminUser) {
    throw new Error("Missing required primary domain or admin user");
  }

  const sharedMailboxConfigs = [
    {
      email: `info@${primaryDomain.domainName}`,
      localPart: "info",
      displayName: "Company Info",
      domain: primaryDomain,
    },
    {
      email: `sales@${primaryDomain.domainName}`,
      localPart: "sales",
      displayName: "Sales Team",
      domain: primaryDomain,
    },
    {
      email: `support@${(supportDomain ?? primaryDomain).domainName}`,
      localPart: "support",
      displayName: "Support Team",
      domain: supportDomain ?? primaryDomain,
    },
  ];

  for (const config of sharedMailboxConfigs) {
    const [sharedMailbox] = await db
      .insert(sharedMailboxes)
      .values({
        organizationId,
        domainId: config.domain.id,
        emailAddress: config.email,
        localPart: config.localPart,
        displayName: config.displayName,
        description: `Shared mailbox for ${config.displayName}`,
        quotaBytes: 10 * 1024 * 1024 * 1024,
        createdBy: adminUser.id,
      })
      .returning();

    if (!sharedMailbox) throw new Error(`Failed to create shared mailbox ${config.email}`);

    // Add all users as members
    for (const { user } of createdUsers) {
      await db.insert(sharedMailboxMembers).values({
        sharedMailboxId: sharedMailbox.id,
        userId: user.id,
        permission: user.role === "admin" ? "full" : "read_write",
        canSendAs: user.role === "admin",
        canDelete: user.role === "admin",
        addedBy: adminUser.id,
      });
    }

    console.info(`  ✓ Created shared mailbox: ${config.email}`);
  }
}

async function seedDistributionLists(
  db: ReturnType<typeof getDatabase>,
  organizationId: string,
  createdDomains: (typeof domains.$inferSelect)[],
  createdUsers: {
    user: typeof users.$inferSelect;
    mailboxes: (typeof mailboxes.$inferSelect)[];
  }[]
) {
  console.info("📋 Seeding distribution lists...");

  const primaryDomain = createdDomains.find((d) => d.isPrimary);
  const adminUser = createdUsers.find((u) => u.user.role === "admin")?.user;

  if (!primaryDomain || !adminUser) {
    throw new Error("Missing required primary domain or admin user");
  }

  const listConfigs = [
    {
      email: `all@${primaryDomain.domainName}`,
      localPart: "all",
      displayName: "All Employees",
      description: "All company employees",
      includeAll: true,
      moderationRequired: false,
    },
    {
      email: `engineering@${primaryDomain.domainName}`,
      localPart: "engineering",
      displayName: "Engineering Team",
      description: "Engineering department mailing list",
      department: "Engineering",
      moderationRequired: false,
    },
    {
      email: `announcements@${primaryDomain.domainName}`,
      localPart: "announcements",
      displayName: "Company Announcements",
      description: "Official company announcements",
      includeAll: true,
      moderationRequired: true,
    },
  ];

  for (const config of listConfigs) {
    const listSettings: DistributionListSettings = {
      allowExternalPosts: false,
      moderationRequired: config.moderationRequired,
      moderatorIds: [adminUser.id],
      replyToList: true,
      maxMessageSize: 25 * 1024 * 1024,
      allowedSenderDomains: [],
      blockedSenders: [],
      archiveEnabled: true,
      digestFrequency: "none",
    };

    const [list] = await db
      .insert(distributionLists)
      .values({
        organizationId,
        domainId: primaryDomain.id,
        emailAddress: config.email,
        localPart: config.localPart,
        displayName: config.displayName,
        description: config.description,
        ownerId: adminUser.id,
        settings: listSettings,
        createdBy: adminUser.id,
      })
      .returning();

    if (!list) throw new Error(`Failed to create distribution list ${config.email}`);

    // Add members
    for (const { user } of createdUsers) {
      const shouldInclude = config.includeAll;

      if (shouldInclude) {
        await db.insert(distributionListMembers).values({
          listId: list.id,
          memberType: "user",
          userId: user.id,
          canPost: !config.moderationRequired || user.role === "admin",
          isModerator: user.role === "admin",
          isAdmin: user.id === adminUser.id,
          addedBy: adminUser.id,
        });
      }
    }

    console.info(`  ✓ Created distribution list: ${config.email}`);
  }
}

async function seedRoutingRules(
  db: ReturnType<typeof getDatabase>,
  organizationId: string,
  createdDomains: (typeof domains.$inferSelect)[],
  createdUsers: {
    user: typeof users.$inferSelect;
    mailboxes: (typeof mailboxes.$inferSelect)[];
  }[]
) {
  console.info("🔀 Seeding routing rules...");

  const primaryDomain = createdDomains.find((d) => d.isPrimary);
  const adminUser = createdUsers.find((u) => u.user.role === "admin")?.user;

  if (!primaryDomain || !adminUser) {
    throw new Error("Missing required primary domain or admin user");
  }

  // Domain-level routing rule
  await db.insert(domainRoutingRules).values({
    organizationId,
    domainId: primaryDomain.id,
    name: "Block suspicious attachments",
    description: "Reject emails with potentially dangerous attachments",
    priority: 10,
    applyToInbound: true,
    applyToOutbound: false,
    conditions: [
      {
        field: "attachment",
        operator: "matches",
        value: "\\.(exe|bat|cmd|scr|pif|vbs|js)$",
        isRegex: true,
        caseInsensitive: true,
      },
    ],
    matchMode: "any",
    action: "reject",
    actionDetails: {
      rejectMessage:
        "This message was rejected because it contains a potentially dangerous attachment.",
    },
    stopProcessing: true,
    enableLogging: true,
    createdBy: adminUser.id,
  });

  await db.insert(domainRoutingRules).values({
    organizationId,
    domainId: primaryDomain.id,
    name: "Forward CEO emails to assistant",
    description: "BCC emails to CEO to executive assistant",
    priority: 50,
    applyToInbound: true,
    applyToOutbound: false,
    conditions: [
      {
        field: "to",
        operator: "equals",
        value: `sarah.johnson@${primaryDomain.domainName}`,
        caseInsensitive: true,
      },
    ],
    matchMode: "all",
    action: "add_bcc",
    actionDetails: {
      bccTo: [`john.smith@${primaryDomain.domainName}`],
    },
    stopProcessing: false,
    enableLogging: true,
    createdBy: adminUser.id,
  });

  // Organization-level transport rule
  await db.insert(transportRules).values({
    organizationId,
    name: "Add confidentiality disclaimer",
    description: "Add legal disclaimer to all outbound emails",
    priority: 100,
    applyToInbound: false,
    applyToOutbound: true,
    conditions: [],
    matchMode: "all",
    action: "add_disclaimer",
    actionDetails: {
      footerText:
        "CONFIDENTIAL: This email and any attachments are confidential and may be privileged.",
      footerHtml:
        "<p style='font-size:11px;color:#666;'>CONFIDENTIAL: This email and any attachments are confidential and may be privileged.</p>",
    },
    stopProcessing: false,
    enableLogging: false,
    createdBy: adminUser.id,
  });

  console.info("  ✓ Created routing rules");
}

// ============================================================
// MAIN SEED FUNCTION
// ============================================================

export async function seed() {
  console.info("\n🌱 Starting database seed...\n");

  const db = getDatabase();

  try {
    // Clear existing data (in reverse dependency order)
    console.info("🗑️  Clearing existing data...");
    await db.delete(transportRules);
    await db.delete(domainRoutingRules);
    await db.delete(distributionListMembers);
    await db.delete(distributionLists);
    await db.delete(sharedMailboxMembers);
    await db.delete(sharedMailboxes);
    await db.delete(labels);
    await db.delete(folders);
    await db.delete(mailboxes);
    await db.delete(userDomainPermissions);
    await db.delete(userEmailAddresses);
    await db.delete(users);
    await db.delete(domainSettings);
    await db.delete(domainDkimKeys);
    await db.delete(domainDnsRecords);
    await db.delete(domains);
    await db.delete(organizations);
    console.info("  ✓ Cleared existing data\n");

    // Seed data
    const org = await seedOrganization(db);
    const createdDomains = await seedDomains(db, org.id);
    const createdUsers = await seedUsers(db, org.id, createdDomains);
    await seedSharedMailboxes(db, org.id, createdDomains, createdUsers);
    await seedDistributionLists(db, org.id, createdDomains, createdUsers);
    await seedRoutingRules(db, org.id, createdDomains, createdUsers);

    console.info("\n✅ Database seed completed successfully!\n");
    console.info("📊 Summary:");
    console.info(`   - 1 organization`);
    console.info(`   - ${createdDomains.length} domains`);
    console.info(`   - ${createdUsers.length} users`);
    console.info(`   - ${createdUsers.length * createdDomains.length} mailboxes`);
    console.info(`   - 3 shared mailboxes`);
    console.info(`   - 3 distribution lists`);
    console.info(`   - 3 routing rules`);
  } catch (error) {
    console.error("\n❌ Seed failed:", error);
    throw error;
  }
}

// ============================================================
// CLI ENTRY POINT
// ============================================================

if (require.main === module) {
  seed()
    .then(() => closeConnection())
    .then(() => process.exit(0))
    .catch((error: unknown) => {
      console.error(error);
      process.exit(1);
    });
}
