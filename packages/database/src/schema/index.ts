/**
 * Enterprise Email Database - Schema Index
 * Exports all schema definitions
 */

// Enums
export * from "./enums";

// Core tables
export * from "./organizations";
export * from "./domains";
export * from "./users";
export * from "./mailboxes";
export * from "./emails";

// Collaboration
export * from "./shared-mailboxes";
export * from "./distribution-lists";

// Routing
export * from "./routing";

// Audit & Security
export * from "./audit";

// Relations
export * from "./relations";
