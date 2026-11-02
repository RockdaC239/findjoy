export function verifiedPhoneNumber(claims: Record<string, unknown>): string | null {
  if (claims.phone_number_verified !== true || typeof claims.phone_number !== "string") return null;
  const phone = claims.phone_number.trim();
  return /^\+?\d[\d -]{5,24}$/.test(phone) ? phone : null;
}

export function validDisplayName(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.trim().length <= 80 && !/[\u0000-\u001f\u007f]/.test(value);
}
