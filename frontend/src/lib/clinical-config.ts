const clinicalMode = process.env.MEDITWIN_APP_MODE === "clinical";

// Server-side configuration clinical mode needs before it may serve anything. This checks presence
// only; docs/CLINICAL_LAUNCH.md lists the governance work that must also be complete.
const requiredClinicalConfiguration = [
  "DATABASE_URL",
  "AUTH_PROVIDER_URL",
  "AUTH_PROVIDER_SECRET",
  "ONTOMORPH_API_KEY",
  "HOLON_API_KEY",
  "CLINICAL_CONTENT_APPROVAL_ID",
];

export function getClinicalReadiness() {
  const missing = requiredClinicalConfiguration.filter((name) => !process.env[name]);
  return {
    mode: clinicalMode ? "clinical" : "demo",
    ready: !clinicalMode || missing.length === 0,
    missing,
  };
}

export function isClinicalMode() {
  return clinicalMode;
}
