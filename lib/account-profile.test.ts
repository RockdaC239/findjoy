import { describe, expect, it } from "vitest";
import { verifiedPhoneNumber } from "./account-profile";

describe("verified registration phone", () => {
  it("accepts only verified, valid phone claims", () => {
    expect(verifiedPhoneNumber({ phone_number: "+8613800000000", phone_number_verified: true })).toBe("+8613800000000");
    for (const claims of [{}, { phone_number: "13800000000" }, { phone_number: "13800000000", phone_number_verified: false }, { phone_number: "invalid", phone_number_verified: true }]) {
      expect(verifiedPhoneNumber(claims)).toBeNull();
    }
  });
});
