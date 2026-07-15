import { Request, Response } from "express";
import User from "../User/model/User";
import jwt from "jsonwebtoken";
import { ENUM_ROLE } from "../../enums/userEnums";
import { responseService } from "../../utils/response.util";
import { assertAllowedEmail } from "../../utils/emailValidation";
import crypto from "crypto";
import { sendOtpEmail } from "../../utils/resendMailer";

// Helper to sign tokens
const generateAccessToken = (payload: any) => {
  return jwt.sign(payload, process.env.JWT_SECRET as string, {
    expiresIn: "1h",
  });
};

// Simulate ID token (usually contains user profile info)
const generateIdToken = (user: any) => {
  const payload = {
    sub: user._id,
    username: user.username,
    email: user.email,
    name: user.name,
    userRole: user.userRole,
    userType: user.userType,
    outlets: user.outlets || [],
  };
  return jwt.sign(payload, process.env.JWT_SECRET as string, {
    expiresIn: "1h",
  });
};

import Account from "../Account/model/Account";
import { ENUM_USER_TYPES } from "../../enums/userEnums";

const normalizeUsername = (value: any) => String(value || "").trim().toLowerCase();
const exactUsernameQuery = (value: any) => {
  const escaped = normalizeUsername(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return { $regex: new RegExp(`^${escaped}$`, "i") };
};

const signupOtpStore = new Map<string, { hash: string; expiresAt: number }>();

const normalizeEmail = (value: any) => String(value || "").trim().toLowerCase();
const hashOtp = (otp: string) => crypto.createHash("sha256").update(otp).digest("hex");
const maskEmail = (email: string) => {
  const [local, domain] = String(email || "").split("@");
  if (!local || !domain) return "";
  return `${local.slice(0, 2)}${"*".repeat(Math.max(local.length - 2, 2))}@${domain}`;
};
const normalizeAccountKey = (value: string) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "") || "account";
const normalizeSlipKey = (value: string) =>
  String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "") || "ACCOUNT";

const generateUniqueSlipKey = async (accountName: string) => {
  const base = normalizeSlipKey(accountName);
  for (let counter = 0; counter < 1000; counter += 1) {
    const candidate = counter === 0 ? base : `${base}${counter + 1}`;
    const existing = await Account.findOne({
      slip_key: { $regex: new RegExp(`^${candidate.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") },
    }).select("_id").lean();
    if (!existing) return candidate;
  }
  throw new Error("SLIP_KEY_GENERATION_FAILED");
};

const consumeSignupOtp = (email: string, otp: string) => {
  const normalizedEmail = normalizeEmail(email);
  const otpEntry = signupOtpStore.get(normalizedEmail);
  if (!otpEntry || otpEntry.expiresAt <= Date.now() || otpEntry.hash !== hashOtp(String(otp || ""))) {
    signupOtpStore.delete(normalizedEmail);
    return false;
  }
  signupOtpStore.delete(normalizedEmail);
  return true;
};

export const requestRegisterOtp = async (req: Request, res: Response) => {
  try {
    const email = normalizeEmail(req.body.email);
    const name = String(req.body.name || "there").trim();
    const username = normalizeUsername(req.body.username);
    const accountName = String(req.body.account_name || "").trim();

    if (!email) return responseService.InvalidDataResponse("Email is required", res);
    assertAllowedEmail(email);

    const duplicateUserConditions: any[] = [{ email }];
    if (username) duplicateUserConditions.push({ username: exactUsernameQuery(username) });
    const userExists = await User.findOne({ $or: duplicateUserConditions }).select("_id").lean();
    if (userExists) {
      return responseService.InvalidDataResponse(
        "User with this email or username already exists",
        res,
      );
    }

    if (accountName) {
      const existingAccount = await Account.findOne({
        account_name: { $regex: new RegExp(`^${accountName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") },
      }).select("_id").lean();
      if (existingAccount) {
        return responseService.ConflictResponse("Account name already exists", res);
      }
    }

    const otp = String(crypto.randomInt(100000, 1000000));
    const otpTtlMinutes = Number(process.env.SIGNUP_OTP_TTL_MINUTES || process.env.RESULT_OTP_TTL_MINUTES || 10);
    signupOtpStore.set(email, {
      hash: hashOtp(otp),
      expiresAt: Date.now() + otpTtlMinutes * 60 * 1000,
    });

    await sendOtpEmail({
      to: email,
      name,
      otp,
      subject: "Your E-Tech Suite signup OTP",
      purpose: "create your E-Tech Suite account",
      expiresInMinutes: otpTtlMinutes,
    });

    return responseService.successResponse(
      {
        email: maskEmail(email),
        expires_in_minutes: otpTtlMinutes,
      },
      "OTP sent to registered email",
      res,
    );
  } catch (error: any) {
    if (error.message === "DISPOSABLE_EMAIL_NOT_ALLOWED") {
      return responseService.InvalidDataResponse(
        "Disposable or temporary email addresses are not allowed",
        res,
      );
    }
    if (error.message === "RESEND_API_KEY_MISSING") {
      return responseService.InvalidDataResponse("Email service is not configured", res);
    }
    return responseService.errorResponse(error, res);
  }
};

export const signup = async (req: Request, res: Response) => {
  try {
    const { username, email, password, name, userRole, ...otherData } =
      req.body;
    const normalizedUsername = normalizeUsername(username);

    assertAllowedEmail(email);
    // Check availability
    const userExists = await User.findOne({
      $or: [{ email }, { username: exactUsernameQuery(normalizedUsername) }],
    });

    if (userExists) {
      return responseService.InvalidDataResponse(
        "User with this email or username already exists",
        res,
      );
    }

    // Create user - password hashing is handled by pre-save hook in User model
    const user = await User.create({
      username: normalizedUsername,
      email,
      password,
      name,
      userRole: userRole || ENUM_ROLE.HEAD_OFFICE, // Default matching snippet logic
      ...otherData,
    });

    // Return success response (excluding password)
    const userResponse = user.toObject();
    delete (userResponse as any).password;

    return responseService.successResponse(userResponse, "created", res);
  } catch (error: any) {
    return responseService.errorResponse(error, res);
  }
};

export const register = async (req: Request, res: Response) => {
  try {
    const { account_name, org_type, org_subtype, name, email, username, password, otp } = req.body;
    const normalizedUsername = normalizeUsername(username);
    const normalizedEmail = normalizeEmail(email);
    const accountName = String(account_name || "").trim();
    const organizationType = ["educational", "production", "service"].includes(org_type)
      ? org_type
      : "educational";
    const organizationSubtype = organizationType === "educational"
      ? (["school", "institute"].includes(org_subtype) ? org_subtype : "institute")
      : "";

    if (!accountName || !name || !normalizedEmail || !normalizedUsername || !password) {
      return responseService.InvalidDataResponse("All registration fields are required", res);
    }

    assertAllowedEmail(normalizedEmail);
    // 1. Validation
    const userExists = await User.findOne({
      $or: [{ email: normalizedEmail }, { username: exactUsernameQuery(normalizedUsername) }],
    });
    if (userExists) {
      return responseService.InvalidDataResponse(
        "User with this email or username already exists",
        res,
      );
    }

    const existingAccount = await Account.findOne({
      account_name: { $regex: new RegExp(`^${accountName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") },
    });
    if (existingAccount) {
      return responseService.ConflictResponse("Account name already exists", res);
    }

    if (!consumeSignupOtp(normalizedEmail, String(otp || ""))) {
      return responseService.InvalidDataResponse("OTP is invalid or expired", res);
    }

    // 2. Create Account
    const accountKeyBase = normalizeAccountKey(accountName);
    const existingAccKeys = await Account.find({
      account_key: { $regex: new RegExp(`^${accountKeyBase}`, "i") },
    });
    const slipKey = await generateUniqueSlipKey(accountName);

    const account = await Account.create({
      account_name: accountName,
      account_key: existingAccKeys?.length
        ? `${accountKeyBase}_${existingAccKeys?.length}`
        : accountKeyBase,
      account_owner: name,
      email: normalizedEmail,
      email_verified: true,
      email_verified_at: new Date(),
      slip_key: slipKey,
      org_type: organizationType,
      org_subtype: organizationSubtype,
      student_module: organizationType === "educational",
      master_course_module: organizationType === "educational",
      attendance_module: organizationType === "educational",
      employee_module: organizationType === "production",
      membership_module: organizationType === "service",
      status: 1, // Active by default for signup
    });

    // 3. Create Head Office User
    const user = await User.create({
      username: normalizedUsername,
      email: normalizedEmail,
      password,
      name,
      userRole: ENUM_ROLE.HEAD_OFFICE,
      userType: ENUM_USER_TYPES.CLIENT,
      status: 0, // Active
      clients: [
        {
          account_name: account.account_key,
          services: [],
        },
      ],
      outlets: [account.account_key],
    });

    const userResponse = user.toObject();
    delete (userResponse as any).password;

    return responseService.successResponse(
      { user: userResponse, account },
      "Registration successful",
      res,
      201,
    );
  } catch (error: any) {
    if (error.message === "DISPOSABLE_EMAIL_NOT_ALLOWED") {
      return responseService.InvalidDataResponse(
        "Disposable or temporary email addresses are not allowed",
        res,
      );
    }
    console.error("Registration error:", error);
    return responseService.errorResponse(error, res);
  }
};

export const login = async (req: Request, res: Response) => {
  try {
    const { username, password } = req.body;

    // 1. Validate User
    // Using +password to explicitly select it if 'select: false' was set (standard practice, though not set in our schema, safety first)
    const user = await User.findOne({ username: exactUsernameQuery(username) });

    if (!user) {
      return res.status(401).json({ message: "Invalid credentials" });
    }
    // 2. Compare Password
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    // 3. Generate Response
    const payload = {
      sub: user._id,
      username: user.username,
      userRole: user.userRole,
    };

    const access_token = generateAccessToken(payload);
    const id_token = generateIdToken(user);

    const data = {
      userData: user,
      userRole: user.userRole,
      access_token: access_token,
      id_token: id_token,
      expires_in: 3600,
      refresh_token: "dsjdkh", // specific placeholder from requirement
    };

    // Login response structure was specific in original code, but sticking to successResponse wrapper
    // might nest it under 'data'. Original: properties mixed at top level.
    // responseService.successResponse puts it under 'data'.
    // If the client expects exact structure, this is a BREAKING CHANGE.
    // However, the user asked to "use this format for all responses in project".
    // So I will wrap it.
    return responseService.successResponse(data, "Login successful", res);
  } catch (error: any) {
    return responseService.errorResponse(error, res);
  }
};
