import { describe, it, expect, vi } from "vitest";
import {
  hashPassword,
  verifyPassword,
  signToken,
  decodeToken,
  getTokenFromHeader,
} from "../src/auth";

describe("auth module", () => {
  describe("hashPassword", () => {
    it("returns a string with salt:hash format", () => {
      const result = hashPassword("mypassword123");
      expect(result).toContain(":");
      const [salt, hash] = result.split(":");
      expect(salt).toBeDefined();
      expect(hash).toBeDefined();
      expect(salt.length).toBe(32); // 16 bytes as hex = 32 chars
      expect(hash.length).toBe(128); // 64 bytes as hex = 128 chars
    });

    it("produces different hashes for the same password", () => {
      const hash1 = hashPassword("password123");
      const hash2 = hashPassword("password123");
      expect(hash1).not.toBe(hash2);
    });

    it("handles empty string", () => {
      const result = hashPassword("");
      expect(result).toContain(":");
    });

    it("handles unicode passwords", () => {
      const result = hashPassword("🔐🚀中文パスワード");
      expect(result).toContain(":");
    });
  });

  describe("verifyPassword", () => {
    it("verifies correct password", () => {
      const hash = hashPassword("secret123");
      expect(verifyPassword("secret123", hash)).toBe(true);
    });

    it("rejects incorrect password", () => {
      const hash = hashPassword("secret123");
      expect(verifyPassword("wrongpassword", hash)).toBe(false);
    });

    it("rejects empty string", () => {
      const hash = hashPassword("secret123");
      expect(verifyPassword("", hash)).toBe(false);
    });

    it("handles same stored input bug — must return true for own", () => {
      const password = "mySecretPassword!";
      const hash = hashPassword(password);
      expect(verifyPassword(password, hash)).toBe(true);
      expect(verifyPassword(password, hash)).toBe(true);
    });
  });

  describe("signToken", () => {
    it("returns a JWT string", () => {
      const token = signToken({ sub: "user-123", email: "test@example.com" });
      expect(typeof token).toBe("string");
      expect(token.split(".").length).toBe(3); // header.payload.signature
    });

    it("includes the payload in the token", () => {
      const token = signToken({ sub: "user-456" });
      const decoded = decodeToken(token);
      expect(decoded).not.toBeNull();
      expect(decoded.sub).toBe("user-456");
    });

    it("includes scope 'auth' in the token", () => {
      const token = signToken({ sub: "user-789" });
      const decoded = decodeToken(token);
      expect(decoded).not.toBeNull();
      expect(decoded.scope).toBe("auth");
    });
  });

  describe("decodeToken", () => {
    it("decodes a valid token", () => {
      const payload = { sub: "user-abc", role: "admin" };
      const token = signToken(payload);
      const decoded = decodeToken(token);
      expect(decoded).not.toBeNull();
      expect(decoded.sub).toBe("user-abc");
      expect(decoded.role).toBe("admin");
    });

    it("returns null for invalid token", () => {
      expect(decodeToken("invalid-token")).toBeNull();
    });

    it("returns null for null input", () => {
      expect(decodeToken(null as any)).toBeNull();
    });

    it("returns null for undefined input", () => {
      expect(decodeToken(undefined)).toBeNull();
    });

    it("returns null for empty string", () => {
      expect(decodeToken("")).toBeNull();
    });

    it("returns null for a tampered token", () => {
      const token = signToken({ sub: "user-123" });
      const tampered = token.slice(0, -5) + "XXXXX";
      expect(decodeToken(tampered)).toBeNull();
    });
  });

  describe("getTokenFromHeader", () => {
    it("extracts token from Bearer header", () => {
      const req = { headers: { authorization: "Bearer test-token-123" } };
      expect(getTokenFromHeader(req as any)).toBe("test-token-123");
    });

    it("returns null for missing authorization header", () => {
      const req = { headers: {} };
      expect(getTokenFromHeader(req as any)).toBeNull();
    });

    it("returns null for non-Bearer format", () => {
      const req = { headers: { authorization: "Basic dGVzdA==" } };
      expect(getTokenFromHeader(req as any)).toBeNull();
    });

    it("returns null for just 'Bearer' without token", () => {
      const req = { headers: { authorization: "Bearer" } };
      expect(getTokenFromHeader(req as any)).toBeNull();
    });

    it("returns null for empty string", () => {
      const req = { headers: { authorization: "" } };
      expect(getTokenFromHeader(req as any)).toBeNull();
    });
  });
});
