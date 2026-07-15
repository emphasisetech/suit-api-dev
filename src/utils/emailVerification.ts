import crypto from "crypto";

export const createEmailVerificationToken = () => {
  const tokenTtlHours = Number(process.env.EMAIL_VERIFICATION_TTL_HOURS || 24);
  const token = crypto.randomBytes(32).toString("hex");
  return {
    token,
    tokenHash: hashEmailVerificationToken(token),
    expiresAt: new Date(Date.now() + tokenTtlHours * 60 * 60 * 1000),
  };
};

export const hashEmailVerificationToken = (token: string) =>
  crypto.createHash("sha256").update(token).digest("hex");

export const buildEmailVerificationUrl = (
  resourcePath: "accounts" | "student",
  token: string
) => {
  const baseUrl = (
    process.env.EMAIL_VERIFICATION_BASE_URL ||
    process.env.PUBLIC_API_URL ||
    "http://localhost:5000/api/v1"
  ).replace(/\/+$/, "");

  return `${baseUrl}/${resourcePath}/verify-email?token=${encodeURIComponent(token)}`;
};

export const stripEmailVerificationSecrets = <T extends Record<string, any>>(
  record: T
) => {
  if (!record) return record;
  delete record.email_verification_token_hash;
  delete record.email_verification_expires_at;
  return record;
};
