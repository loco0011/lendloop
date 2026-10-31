import { appError } from "./errors";

/**
 * Convex validators check types but not length or whitespace, so every
 * free-text argument passes through here before being stored.
 */
export function cleanText(
  value: string,
  fieldLabel: string,
  { min = 1, max }: { min?: number; max: number },
): string {
  const trimmed = value.trim();
  if (trimmed.length < min) {
    throw appError("INVALID_INPUT", `${fieldLabel} is required.`);
  }
  if (trimmed.length > max) {
    throw appError(
      "INVALID_INPUT",
      `${fieldLabel} must be ${max} characters or fewer.`,
    );
  }
  return trimmed;
}
