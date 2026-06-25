export const EMERGENCY_TRIGGER = "devil devil";
export const SUSPENSION_MINUTES = 60;
export const EMERGENCY_UNLOCK_CODE = "143143";

export function normalizeEmergencyText(value: string | null | undefined) {
  return value?.trim().toLowerCase() ?? "";
}

export function isEmergencyMessage(value: string | null | undefined) {
  return normalizeEmergencyText(value) === EMERGENCY_TRIGGER;
}

export function getSuspensionUntilISO() {
  return new Date(Date.now() + SUSPENSION_MINUTES * 60 * 1000).toISOString();
}

export function isEmergencyUnlockCode(value: string | null | undefined) {
  return (value ?? "").trim() === EMERGENCY_UNLOCK_CODE;
}
