import { describe, expect, it } from "vitest";
import { toE164 } from "@/lib/notify";

describe("toE164", () => {
  it("passes through valid E.164 numbers", () => {
    expect(toE164("+919812345678")).toBe("+919812345678");
    expect(toE164("  +14155550123 ")).toBe("+14155550123");
  });
  it("prefixes +91 to bare 10-digit Indian mobiles", () => {
    expect(toE164("9812345678")).toBe("+919812345678");
  });
  it("strips punctuation and spaces before parsing", () => {
    expect(toE164("98123-45678")).toBe("+919812345678");
    expect(toE164("98123 45678")).toBe("+919812345678");
    expect(toE164("(981) 234-5678")).toBe("+919812345678");
  });
  it("accepts 12 digits that already start with 91", () => {
    expect(toE164("919812345678")).toBe("+919812345678");
  });
  it("rejects too-short and too-long numbers", () => {
    expect(toE164("981234567")).toBeNull(); // 9 digits
    expect(toE164("98123456789")).toBeNull(); // 11 digits, not 91-prefixed
    expect(toE164("+12")).toBeNull(); // under 8 digits after +
  });
  it("rejects garbage", () => {
    expect(toE164("")).toBeNull();
    expect(toE164("call me maybe")).toBeNull();
  });
});
