const clinicalMode = process.env.MEDITWIN_APP_MODE === "clinical";

const requiredClinicalConfiguration = [
  "DATABASE_URL",
  "AUTH_PROVIDER_URL",
  "AUTH_PROVIDER_SECRET",
  "ONTOMORPH_BASE_URL",
  "ONTOMORPH_API_KEY",
  "HOLON_BASE_URL",
  "HOLON_API_KEY",
];

export function getClinicalReadiness() {
  const missing = requiredClinicalConfiguration.filter((name) => !process.env[name]);
  return {
    mode: clinicalMode ? "clinical" : "demo",
    ready: !clinicalMode || missing.length === 0,
    missing: missing.map((name) => name.replace(/_(URL|KEY|SECRET)$/, "")),
  };
}

export function isClinicalMode() {
  return clinicalMode;
}