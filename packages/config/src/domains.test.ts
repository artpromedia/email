/**
 * Domain Configuration Tests
 * Tests for domain validation, record generation, and configuration utilities
 */

import { describe, it, expect } from "vitest";
import {
  DomainStatus,
  VerificationType,
  domainSchema,
  domainConfigSchema,
  isValidDomain,
  extractDomain,
  isDomainAllowed,
  generateVerificationToken,
  generateVerificationDnsRecord,
  generateSpfRecord,
  generateDmarcRecord,
  generateDkimRecordName,
  createDefaultDomainConfig,
  type SpfConfig,
  type DmarcConfig,
} from "./domains.js";

describe("DomainStatus", () => {
  it("should have all expected status values", () => {
    expect(DomainStatus.PENDING).toBe("pending");
    expect(DomainStatus.VERIFYING).toBe("verifying");
    expect(DomainStatus.ACTIVE).toBe("active");
    expect(DomainStatus.SUSPENDED).toBe("suspended");
    expect(DomainStatus.DELETED).toBe("deleted");
  });
});

describe("VerificationType", () => {
  it("should have all expected verification types", () => {
    expect(VerificationType.DNS_TXT).toBe("dns_txt");
    expect(VerificationType.DNS_CNAME).toBe("dns_cname");
    expect(VerificationType.EMAIL).toBe("email");
    expect(VerificationType.FILE).toBe("file");
  });
});

describe("domainSchema", () => {
  it("should accept valid domains", () => {
    expect(domainSchema.safeParse("example.com").success).toBe(true);
    expect(domainSchema.safeParse("sub.example.com").success).toBe(true);
    expect(domainSchema.safeParse("my-domain.org").success).toBe(true);
    expect(domainSchema.safeParse("a.io").success).toBe(true);
    expect(domainSchema.safeParse("deep.sub.domain.example.co.uk").success).toBe(true);
  });

  it("should reject invalid domains", () => {
    expect(domainSchema.safeParse("").success).toBe(false);
    expect(domainSchema.safeParse("example").success).toBe(false);
    expect(domainSchema.safeParse("-example.com").success).toBe(false);
    expect(domainSchema.safeParse("example-.com").success).toBe(false);
    expect(domainSchema.safeParse(".example.com").success).toBe(false);
    expect(domainSchema.safeParse("example..com").success).toBe(false);
    expect(domainSchema.safeParse("exa mple.com").success).toBe(false);
  });

  it("should enforce minimum length", () => {
    expect(domainSchema.safeParse("a.b").success).toBe(false);
  });
});

describe("isValidDomain", () => {
  it("should return true for valid domains", () => {
    expect(isValidDomain("example.com")).toBe(true);
    expect(isValidDomain("mail.example.com")).toBe(true);
    expect(isValidDomain("example-with-dash.org")).toBe(true);
  });

  it("should return false for invalid domains", () => {
    expect(isValidDomain("")).toBe(false);
    expect(isValidDomain("example")).toBe(false);
    expect(isValidDomain("example.c")).toBe(false);
    expect(isValidDomain("-invalid.com")).toBe(false);
  });
});

describe("extractDomain", () => {
  it("should extract domain from email address", () => {
    expect(extractDomain("user@example.com")).toBe("example.com");
    expect(extractDomain("admin@mail.example.com")).toBe("mail.example.com");
  });

  it("should return lowercase domain", () => {
    expect(extractDomain("user@EXAMPLE.COM")).toBe("example.com");
    expect(extractDomain("user@Example.Org")).toBe("example.org");
  });

  it("should return null for invalid email", () => {
    expect(extractDomain("invalid")).toBeNull();
    expect(extractDomain("")).toBeNull();
  });

  it("should handle email with multiple @ symbols", () => {
    const result = extractDomain("user@sub@example.com");
    expect(result).toBe("example.com");
  });
});

describe("isDomainAllowed", () => {
  it("should return true when domain is in allowed list", () => {
    expect(isDomainAllowed("example.com", ["example.com", "test.com"])).toBe(true);
  });

  it("should be case-insensitive", () => {
    expect(isDomainAllowed("EXAMPLE.COM", ["example.com"])).toBe(true);
    expect(isDomainAllowed("example.com", ["EXAMPLE.COM"])).toBe(true);
  });

  it("should return false when domain is not in allowed list", () => {
    expect(isDomainAllowed("other.com", ["example.com", "test.com"])).toBe(false);
  });

  it("should return false for empty allowed list", () => {
    expect(isDomainAllowed("example.com", [])).toBe(false);
  });
});

describe("generateVerificationToken", () => {
  it("should generate a 64-character token", () => {
    const token = generateVerificationToken();
    expect(token).toHaveLength(64);
  });

  it("should only contain alphanumeric characters", () => {
    const token = generateVerificationToken();
    expect(token).toMatch(/^[A-Za-z0-9]+$/);
  });

  it("should generate unique tokens", () => {
    const token1 = generateVerificationToken();
    const token2 = generateVerificationToken();
    expect(token1).not.toBe(token2);
  });
});

describe("generateVerificationDnsRecord", () => {
  it("should generate correct DNS TXT record", () => {
    const record = generateVerificationDnsRecord("_verify", "test-token-123");

    expect(record.type).toBe("TXT");
    expect(record.name).toBe("_verify");
    expect(record.value).toBe("v=enterprise-email;t=test-token-123");
    expect(record.ttl).toBe(3600);
  });

  it("should use the provided prefix", () => {
    const record = generateVerificationDnsRecord("_custom-prefix", "token");
    expect(record.name).toBe("_custom-prefix");
  });
});

describe("generateSpfRecord", () => {
  it("should generate basic SPF record", () => {
    const config: SpfConfig = {
      mechanisms: ["mx", "a"],
      qualifier: "-",
      includes: [],
    };

    const record = generateSpfRecord(config, "example.com");
    expect(record).toBe("v=spf1 mx a -all");
  });

  it("should include includes", () => {
    const config: SpfConfig = {
      mechanisms: ["mx"],
      qualifier: "~",
      includes: ["_spf.google.com", "_spf.example.com"],
    };

    const record = generateSpfRecord(config, "example.com");
    expect(record).toBe("v=spf1 mx include:_spf.google.com include:_spf.example.com ~all");
  });

  it("should handle empty mechanisms", () => {
    const config: SpfConfig = {
      mechanisms: [],
      qualifier: "-",
      includes: [],
    };

    const record = generateSpfRecord(config, "example.com");
    expect(record).toBe("v=spf1 -all");
  });

  it("should support different qualifiers", () => {
    const qualifiers: Array<"+" | "-" | "~" | "?"> = ["+", "-", "~", "?"];
    qualifiers.forEach((qualifier) => {
      const config: SpfConfig = {
        mechanisms: [],
        qualifier,
        includes: [],
      };
      const record = generateSpfRecord(config, "example.com");
      expect(record).toContain(`${qualifier}all`);
    });
  });
});

describe("generateDmarcRecord", () => {
  it("should generate basic DMARC record", () => {
    const config: DmarcConfig = {
      policy: "quarantine",
      percentage: 100,
      adkim: "s",
      aspf: "s",
    };

    const record = generateDmarcRecord(config);
    expect(record).toContain("v=DMARC1");
    expect(record).toContain("p=quarantine");
    expect(record).toContain("pct=100");
    expect(record).toContain("adkim=s");
    expect(record).toContain("aspf=s");
  });

  it("should include subdomain policy when set", () => {
    const config: DmarcConfig = {
      policy: "reject",
      subdomainPolicy: "quarantine",
      percentage: 100,
      adkim: "r",
      aspf: "r",
    };

    const record = generateDmarcRecord(config);
    expect(record).toContain("sp=quarantine");
  });

  it("should not include subdomain policy when not set", () => {
    const config: DmarcConfig = {
      policy: "none",
      percentage: 50,
      adkim: "r",
      aspf: "r",
    };

    const record = generateDmarcRecord(config);
    expect(record).not.toContain("sp=");
  });

  it("should include report email when set", () => {
    const config: DmarcConfig = {
      policy: "reject",
      percentage: 100,
      reportEmail: "dmarc@example.com",
      adkim: "s",
      aspf: "s",
    };

    const record = generateDmarcRecord(config);
    expect(record).toContain("rua=mailto:dmarc@example.com");
  });

  it("should include forensic email when set", () => {
    const config: DmarcConfig = {
      policy: "reject",
      percentage: 100,
      forensicEmail: "forensic@example.com",
      adkim: "s",
      aspf: "s",
    };

    const record = generateDmarcRecord(config);
    expect(record).toContain("ruf=mailto:forensic@example.com");
  });

  it("should not include report/forensic emails when not set", () => {
    const config: DmarcConfig = {
      policy: "none",
      percentage: 100,
      adkim: "r",
      aspf: "r",
    };

    const record = generateDmarcRecord(config);
    expect(record).not.toContain("rua=");
    expect(record).not.toContain("ruf=");
  });

  it("should support all policy values", () => {
    const policies: Array<"none" | "quarantine" | "reject"> = ["none", "quarantine", "reject"];
    policies.forEach((policy) => {
      const config: DmarcConfig = {
        policy,
        percentage: 100,
        adkim: "r",
        aspf: "r",
      };
      const record = generateDmarcRecord(config);
      expect(record).toContain(`p=${policy}`);
    });
  });
});

describe("generateDkimRecordName", () => {
  it("should generate correct DKIM record name", () => {
    expect(generateDkimRecordName("mail")).toBe("mail._domainkey");
    expect(generateDkimRecordName("selector1")).toBe("selector1._domainkey");
    expect(generateDkimRecordName("dkim2024")).toBe("dkim2024._domainkey");
  });
});

describe("createDefaultDomainConfig", () => {
  it("should create config with correct domain", () => {
    const config = createDefaultDomainConfig("Example.COM", "org-123");
    expect(config.domain).toBe("example.com");
  });

  it("should set status to pending", () => {
    const config = createDefaultDomainConfig("example.com", "org-123");
    expect(config.status).toBe(DomainStatus.PENDING);
  });

  it("should use DNS_TXT verification by default", () => {
    const config = createDefaultDomainConfig("example.com", "org-123");
    expect(config.verification.type).toBe(VerificationType.DNS_TXT);
  });

  it("should generate a verification token", () => {
    const config = createDefaultDomainConfig("example.com", "org-123");
    expect(config.verification.token).toHaveLength(64);
  });

  it("should set isPrimary from options", () => {
    const config = createDefaultDomainConfig("example.com", "org-123", {
      isPrimary: true,
    });
    expect(config.isPrimary).toBe(true);
  });

  it("should default isPrimary to false", () => {
    const config = createDefaultDomainConfig("example.com", "org-123");
    expect(config.isPrimary).toBe(false);
  });

  it("should set isDefault from options", () => {
    const config = createDefaultDomainConfig("example.com", "org-123", {
      isDefault: true,
    });
    expect(config.isDefault).toBe(true);
  });

  it("should default isDefault to false", () => {
    const config = createDefaultDomainConfig("example.com", "org-123");
    expect(config.isDefault).toBe(false);
  });

  it("should set organizationId", () => {
    const config = createDefaultDomainConfig("example.com", "org-456");
    expect(config.organizationId).toBe("org-456");
  });

  it("should use custom DKIM selector", () => {
    const config = createDefaultDomainConfig("example.com", "org-123", {
      dkimSelector: "custom-selector",
    });
    expect(config.dkim.selector).toBe("custom-selector");
  });

  it("should use default DKIM selector of 'mail'", () => {
    const config = createDefaultDomainConfig("example.com", "org-123");
    expect(config.dkim.selector).toBe("mail");
  });

  it("should use custom DKIM keys path", () => {
    const config = createDefaultDomainConfig("example.com", "org-123", {
      dkimKeysPath: "/custom/path",
    });
    expect(config.dkim.privateKeyPath).toBe("/custom/path/example.com/private.key");
  });

  it("should use default DKIM keys path", () => {
    const config = createDefaultDomainConfig("example.com", "org-123");
    expect(config.dkim.privateKeyPath).toBe("/etc/dkim/keys/example.com/private.key");
  });

  it("should set default DKIM config", () => {
    const config = createDefaultDomainConfig("example.com", "org-123");
    expect(config.dkim.algorithm).toBe("rsa-sha256");
    expect(config.dkim.canonicalization).toBe("relaxed/relaxed");
    expect(config.dkim.keySize).toBe(2048);
  });

  it("should set default SPF config", () => {
    const config = createDefaultDomainConfig("example.com", "org-123");
    expect(config.spf.mechanisms).toEqual(["mx", "a"]);
    expect(config.spf.qualifier).toBe("-");
    expect(config.spf.includes).toEqual([]);
  });

  it("should set default DMARC config", () => {
    const config = createDefaultDomainConfig("example.com", "org-123");
    expect(config.dmarc.policy).toBe("quarantine");
    expect(config.dmarc.percentage).toBe(100);
    expect(config.dmarc.adkim).toBe("s");
    expect(config.dmarc.aspf).toBe("s");
  });

  it("should set default MX record", () => {
    const config = createDefaultDomainConfig("example.com", "org-123");
    expect(config.mxRecords).toHaveLength(1);
    expect(config.mxRecords[0]!.type).toBe("MX");
    expect(config.mxRecords[0]!.value).toBe("mail.example.com");
    expect(config.mxRecords[0]!.priority).toBe(10);
  });

  it("should set default settings", () => {
    const config = createDefaultDomainConfig("example.com", "org-123");
    expect(config.settings.maxEmailsPerDay).toBe(10000);
    expect(config.settings.maxEmailsPerHour).toBe(2000);
    expect(config.settings.maxRecipientsPerEmail).toBe(500);
    expect(config.settings.requireTls).toBe(true);
    expect(config.settings.trackOpens).toBe(true);
    expect(config.settings.trackClicks).toBe(true);
    expect(config.settings.allowedSenderPatterns).toEqual(["*"]);
    expect(config.settings.blockedRecipientPatterns).toEqual([]);
  });

  it("should set empty customRecords", () => {
    const config = createDefaultDomainConfig("example.com", "org-123");
    expect(config.customRecords).toEqual([]);
  });
});

describe("domainConfigSchema", () => {
  it("should validate a complete valid config", () => {
    const config = {
      domain: "example.com",
      status: "active",
      isPrimary: true,
      isDefault: true,
      organizationId: "550e8400-e29b-41d4-a716-446655440000",
      verification: {
        type: "dns_txt",
        token: "a".repeat(32),
        verifiedAt: new Date(),
      },
      dkim: {
        selector: "mail",
        privateKeyPath: "/path/to/key",
        algorithm: "rsa-sha256",
        canonicalization: "relaxed/relaxed",
        keySize: 2048,
      },
      spf: {
        mechanisms: ["mx", "a"],
        qualifier: "-",
        includes: [],
      },
      dmarc: {
        policy: "quarantine",
        percentage: 100,
        adkim: "s",
        aspf: "s",
      },
      mxRecords: [
        { type: "MX" as const, name: "@", value: "mail.example.com", ttl: 3600, priority: 10 },
      ],
      customRecords: [],
      settings: {
        maxEmailsPerDay: 10000,
        maxEmailsPerHour: 2000,
        maxRecipientsPerEmail: 500,
        allowedSenderPatterns: ["*"],
        blockedRecipientPatterns: [],
        requireTls: true,
        trackOpens: true,
        trackClicks: true,
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = domainConfigSchema.safeParse(config);
    expect(result.success).toBe(true);
  });

  it("should reject invalid domain", () => {
    const config = {
      domain: "invalid",
      status: "active",
      isPrimary: false,
      isDefault: false,
      organizationId: "550e8400-e29b-41d4-a716-446655440000",
      verification: { type: "dns_txt", token: "a".repeat(32) },
      dkim: {
        selector: "m",
        privateKeyPath: "/p",
        algorithm: "rsa-sha256",
        canonicalization: "relaxed/relaxed",
        keySize: 2048,
      },
      spf: { mechanisms: [], qualifier: "-", includes: [] },
      dmarc: { policy: "none", percentage: 100, adkim: "r", aspf: "r" },
      mxRecords: [],
      customRecords: [],
      settings: {
        maxEmailsPerDay: 1,
        maxEmailsPerHour: 1,
        maxRecipientsPerEmail: 1,
        allowedSenderPatterns: [],
        blockedRecipientPatterns: [],
        requireTls: true,
        trackOpens: true,
        trackClicks: true,
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = domainConfigSchema.safeParse(config);
    expect(result.success).toBe(false);
  });

  it("should reject invalid status", () => {
    const result = domainConfigSchema.safeParse({
      domain: "example.com",
      status: "invalid_status",
    });
    expect(result.success).toBe(false);
  });

  it("should reject invalid DKIM key size", () => {
    const result = domainConfigSchema.safeParse({
      domain: "example.com",
      status: "active",
      isPrimary: false,
      isDefault: false,
      organizationId: "550e8400-e29b-41d4-a716-446655440000",
      verification: { type: "dns_txt", token: "a".repeat(32) },
      dkim: {
        selector: "mail",
        privateKeyPath: "/path",
        algorithm: "rsa-sha256",
        canonicalization: "relaxed/relaxed",
        keySize: 512, // Too small
      },
      spf: { mechanisms: [], qualifier: "-", includes: [] },
      dmarc: { policy: "none", percentage: 100, adkim: "r", aspf: "r" },
      mxRecords: [],
      customRecords: [],
      settings: {
        maxEmailsPerDay: 1,
        maxEmailsPerHour: 1,
        maxRecipientsPerEmail: 1,
        allowedSenderPatterns: [],
        blockedRecipientPatterns: [],
        requireTls: true,
        trackOpens: true,
        trackClicks: true,
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    expect(result.success).toBe(false);
  });

  it("should reject DMARC percentage outside 0-100", () => {
    const result = domainConfigSchema.safeParse({
      domain: "example.com",
      status: "active",
      isPrimary: false,
      isDefault: false,
      organizationId: "550e8400-e29b-41d4-a716-446655440000",
      verification: { type: "dns_txt", token: "a".repeat(32) },
      dkim: {
        selector: "mail",
        privateKeyPath: "/path",
        algorithm: "rsa-sha256",
        canonicalization: "relaxed/relaxed",
        keySize: 2048,
      },
      spf: { mechanisms: [], qualifier: "-", includes: [] },
      dmarc: { policy: "none", percentage: 150, adkim: "r", aspf: "r" },
      mxRecords: [],
      customRecords: [],
      settings: {
        maxEmailsPerDay: 1,
        maxEmailsPerHour: 1,
        maxRecipientsPerEmail: 1,
        allowedSenderPatterns: [],
        blockedRecipientPatterns: [],
        requireTls: true,
        trackOpens: true,
        trackClicks: true,
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    expect(result.success).toBe(false);
  });

  it("should reject short verification token", () => {
    const result = domainConfigSchema.safeParse({
      domain: "example.com",
      status: "active",
      isPrimary: false,
      isDefault: false,
      organizationId: "550e8400-e29b-41d4-a716-446655440000",
      verification: { type: "dns_txt", token: "short" },
      dkim: {
        selector: "mail",
        privateKeyPath: "/path",
        algorithm: "rsa-sha256",
        canonicalization: "relaxed/relaxed",
        keySize: 2048,
      },
      spf: { mechanisms: [], qualifier: "-", includes: [] },
      dmarc: { policy: "none", percentage: 100, adkim: "r", aspf: "r" },
      mxRecords: [],
      customRecords: [],
      settings: {
        maxEmailsPerDay: 1,
        maxEmailsPerHour: 1,
        maxRecipientsPerEmail: 1,
        allowedSenderPatterns: [],
        blockedRecipientPatterns: [],
        requireTls: true,
        trackOpens: true,
        trackClicks: true,
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    expect(result.success).toBe(false);
  });
});
