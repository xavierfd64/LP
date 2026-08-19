/**
 * System version (spec item 44). A plain constant for now — this update
 * establishes the *concept* of a versioned system and an update-check
 * flow (Part G), not a real update-publishing pipeline. Bump this by hand
 * when a future release actually ships; there is no build-time or runtime
 * mechanism that changes it automatically, and there shouldn't be one
 * until a real, trusted update source exists (spec item 43).
 */
export const SYSTEM_VERSION = "2026.0.0";
