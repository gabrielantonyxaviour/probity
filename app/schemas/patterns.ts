// FROZEN v1 (foundation). Shared regexes for every API boundary. Spec: 06 §4.1.
// Changing a pattern is a cross-lane schema change: announce it to every lane first.
export const UEI = /^[A-Z0-9]{12}$/;
export const CIK10 = /^[0-9]{10}$/;
export const STATE = /^[A-Z]{2}$/;
export const HASH64 = /^[0-9a-f]{64}$/;
export const VENDOR_ID = /^V-\d{5}$/;
export const REQUEST_ID = /^BCR-2026-\d{4}$/;
export const PAYMENT_RUN_ID = /^PR-\d{4}-\d{2}-\d{2}$/;
export const INVOICE_NO = /^INV-[A-Z]{3}-\d{5}$/;
export const RUN_ID = /^[A-Za-z0-9_-]{3,64}$/;
export const EXAMPLE_ID = /^\d{2}[a-z]?-[a-z0-9-]{1,60}$/; // 05b, 06b, 06c
export const UPLOAD_ID = /^up-[0-9a-f]{12}$/;
export const FILE_NAME = /^[a-z0-9][a-z0-9._-]{0,80}$/;
export const QUERY_ID = /^[0-9a-f-]{36}$/;
export const MEMORY_ID = /^[A-Za-z0-9:_-]{1,80}$/;

// Evidence ids: "ev-<query_id[0:8]>-<row>-<fieldcode>" (spine §4.6, REV-25).
export const EVIDENCE_ID = /^ev-[0-9a-f]{8}-\d{1,3}-(ln|ra|ba|sd|cp|pa|rg|ir)$/;
export const LINK_ID = /^lnk-[0-9a-f]{16}$/;
export const CONFLICT_ID = /^cf-[a-z_]+-[0-9a-f]{8}$/;
export const E164_US = /^\+1\d{10}$/;
export const DECISION_ID = /^dec-[A-Za-z0-9_-]{3,64}$/;

/** Pinned policy version (spine §4.1). */
export const POLICY_VERSION = "pp-2026-10-27.1" as const;
