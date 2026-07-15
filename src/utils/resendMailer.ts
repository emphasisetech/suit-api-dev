type SendVerificationEmailParams = {
  to: string;
  name?: string;
  subject: string;
  verificationUrl: string;
};

type SendOtpEmailParams = {
  to: string;
  name?: string;
  otp: string;
  subject?: string;
  purpose?: string;
  expiresInMinutes?: number | string;
};

const getResendConfig = () => ({
  apiKey: process.env.RESEND_API_KEY || "",
  from:
    process.env.RESEND_FROM_EMAIL ||
    process.env.MAIL_FROM ||
    "E-Tech Suite <onboarding@resend.dev>",
});

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

export const sendVerificationEmail = async ({
  to,
  name = "there",
  subject,
  verificationUrl,
}: SendVerificationEmailParams) => {
  const { apiKey, from } = getResendConfig();
  if (!to || !apiKey) {
    console.warn("Resend email verification skipped: missing recipient or RESEND_API_KEY");
    return null;
  }

  const safeName = escapeHtml(name);
  const safeUrl = escapeHtml(verificationUrl);
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject,
      html: `
        <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #111827;">
          <p>Hello ${safeName},</p>
          <p>Please verify your email address for E-Tech Suite.</p>
          <p>
            <a href="${safeUrl}" style="display:inline-block;background:#2563eb;color:#ffffff;padding:10px 16px;text-decoration:none;border-radius:4px;">
              Verify email
            </a>
          </p>
          <p>If the button does not work, copy and paste this link into your browser:</p>
          <p style="word-break: break-all;">${safeUrl}</p>
          <p>This link will expire soon.</p>
        </div>
      `,
      text: `Hello ${name},\n\nPlease verify your email address for E-Tech Suite:\n${verificationUrl}\n\nThis link will expire soon.`,
    }),
  });

  const result: any = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(result?.message || "RESEND_EMAIL_FAILED");
  }

  return result;
};

export const sendOtpEmail = async ({
  to,
  name = "there",
  otp,
  subject = "Your E-Tech Suite result verification OTP",
  purpose = "view your result and generate your certificate",
  expiresInMinutes = process.env.RESULT_OTP_TTL_MINUTES || "10",
}: SendOtpEmailParams) => {
  const { apiKey, from } = getResendConfig();
  if (!to) throw new Error("EMAIL_REQUIRED");
  if (!apiKey) throw new Error("RESEND_API_KEY_MISSING");

  const safeName = escapeHtml(name);
  const safeOtp = escapeHtml(otp);
  const safePurpose = escapeHtml(purpose);
  const safeExpiresInMinutes = escapeHtml(String(expiresInMinutes));
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject,
      html: `
        <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #111827;">
          <p>Hello ${safeName},</p>
          <p>Use this OTP to ${safePurpose}:</p>
          <p style="font-size: 28px; font-weight: 700; letter-spacing: 6px;">${safeOtp}</p>
          <p>This OTP expires in ${safeExpiresInMinutes} minutes.</p>
        </div>
      `,
      text: `Hello ${name},\n\nYour OTP to ${purpose} is: ${otp}\n\nThis OTP expires in ${expiresInMinutes} minutes.`,
    }),
  });

  const result: any = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(result?.message || "RESEND_EMAIL_FAILED");
  }

  return result;
};
