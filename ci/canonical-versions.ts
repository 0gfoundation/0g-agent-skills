/**
 * The single source of truth for SDK versions, shared by every CI check.
 *
 * This file exists because the table used to be copy-pasted into both
 * validate-sdk-versions.ts and validate-manifests.ts, with a "keep in sync"
 * comment standing in for a mechanism. Adding the agentic-id SDK updated one
 * copy and broke the other immediately, which is the whole argument against
 * that arrangement. Change a version here and both checks follow.
 *
 * Must match patterns/NETWORK_CONFIG.md and patterns/AGENTIC_ID.md.
 *
 * Versions are compared VERBATIM, so the caret is significant: `ethers` has
 * none because @0gfoundation/0g-storage-ts-sdk declares an exact peer
 * dependency on ethers@6.13.1.
 */
export const CANONICAL_VERSIONS: Record<string, string> = {
  '@0gfoundation/0g-storage-ts-sdk': '^1.2.12',
  '@0gfoundation/0g-compute-ts-sdk': '^0.9.0',
  // AgenticID is a viem stack, not an ethers one. Both chain libraries are
  // canonical here because the two layers genuinely use different ones.
  '@0gfoundation/0g-agenticid-sdk': '^0.1.6',
  viem: '^2.21.0',
  ethers: '6.13.1',
};

/** Packages renamed upstream and deprecated. These must never reappear. */
export const FORBIDDEN_PACKAGES: Record<string, string> = {
  '@0glabs/0g-ts-sdk': '@0gfoundation/0g-storage-ts-sdk',
  '@0glabs/0g-serving-broker': '@0gfoundation/0g-compute-ts-sdk',
  '@0gfoundation/0g-ts-sdk': '@0gfoundation/0g-storage-ts-sdk',
};
