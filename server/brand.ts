import { ApiError } from "./catalog.ts";
export function validateBrandId(value: unknown): string {
  if (
    typeof value !== "string" ||
    !/^[1-9]\d{0,15}$/.test(value) ||
    !Number.isSafeInteger(Number(value))
  ) {
    throw new ApiError(
      400,
      "INVALID_BRAND_ID",
      "Enter a positive numeric Brand ID within the safe integer range.",
    );
  }
  return value;
}
