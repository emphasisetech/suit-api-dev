import Student from "../Student/model/Student";
import Account from "../Account/model/Account";
import CourseMaster from "../CourseMaster/model/CourseMaster";
import PaymentSequence from "./model/PaymentSequence";
import { assertAllowedEmail } from "../../utils/emailValidation";
import {
  buildEmailVerificationUrl,
  createEmailVerificationToken,
  hashEmailVerificationToken,
  stripEmailVerificationSecrets,
} from "../../utils/emailVerification";
import { sendOtpEmail, sendVerificationEmail } from "../../utils/resendMailer";
import moment from "moment";
import { PaymentFrequency, PaymentStatus } from "../../enums/studentEnums";
import mongoose from "mongoose";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { activeRecordFilter, getSoftDeleteUpdate } from "../../utils/softDelete";

export class StudentService {
  private getCourseDurationMonths(course: any) {
    const durationMatch = String(course?.course_duration || "").match(/(\d+)/);
    return durationMatch ? parseInt(durationMatch[1], 10) : 0;
  }

  private getCoursePeriodCount(course: any) {
    const durationMonths = this.getCourseDurationMonths(course);
    const freq = course?.fee_ferquency as PaymentFrequency;

    if (freq === PaymentFrequency.LUM_SUM) return 1;
    if (!durationMonths || Number.isNaN(durationMonths)) return 1;

    switch (freq) {
      case PaymentFrequency.QUATERLY:
        return Math.ceil(durationMonths / 3);
      case PaymentFrequency.HALF_YEARLY:
        return Math.ceil(durationMonths / 6);
      case PaymentFrequency.YEARLY:
        return Math.ceil(durationMonths / 12);
      case PaymentFrequency.MONTHLY:
      default:
        return durationMonths;
    }
  }

  private calculateTotalCourseFee(course: any) {
    const fee = Number(course?.course_fee || 0);
    if (!fee || Number.isNaN(fee)) return 0;

    const periods = Math.max(this.getCoursePeriodCount(course), 1);
    return Number((fee * periods).toFixed(2));
  }

  private getTotalCourseFee(course: any) {
    const totalCourseFee = Number(course?.total_course_fee || 0);
    return totalCourseFee > 0
      ? totalCourseFee
      : this.calculateTotalCourseFee(course);
  }

  private stripStudentSecrets<T extends Record<string, any>>(record: T) {
    const sanitized = stripEmailVerificationSecrets(record);
    delete sanitized.result_otp_hash;
    delete sanitized.result_otp_expires_at;
    delete sanitized.password;
    delete sanitized.portal_otp_hash;
    delete sanitized.portal_otp_expires_at;
    delete sanitized.portal_access_token_hash;
    delete sanitized.portal_access_token_expires_at;
    const studentRecord: any = sanitized;
    if (Array.isArray(studentRecord.courses)) {
      studentRecord.courses = studentRecord.courses
        .filter((course: any) => course.deleted !== true)
        .map((course: any) => ({
          ...course,
          total_course_fee: this.getTotalCourseFee(course),
          payments: Array.isArray(course.payments)
            ? course.payments.filter((payment: any) => payment.deleted !== true)
            : course.payments,
        }));
    }
    return sanitized;
  }

  private normalizeKeyPrefix(value: unknown) {
    const normalized = String(value || "")
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "");
    return normalized || "STUDENT";
  }

  private normalizeManualStudentKey(value: unknown) {
    return String(value || "").trim();
  }

  private escapeRegex(value: string) {
    return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  private hashOtp(otp: string) {
    return crypto.createHash("sha256").update(otp).digest("hex");
  }

  private maskEmail(email: string) {
    const [local, domain] = String(email || "").split("@");
    if (!local || !domain) return "";
    return `${local.slice(0, 2)}${"*".repeat(Math.max(local.length - 2, 2))}@${domain}`;
  }

  private async getAccountForStudentClient(client: string) {
    const escapedClient = this.escapeRegex(client);
    return Account.findOne({
      $or: [
        { account_key: { $regex: new RegExp(`^${escapedClient}$`, "i") } },
        { account_name: { $regex: new RegExp(`^${escapedClient}$`, "i") } },
        { "outlets.outlet_key": { $regex: new RegExp(`^${escapedClient}$`, "i") } },
      ],
    }).lean();
  }

  private getCloudinaryConfig() {
    const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
    const apiKey = process.env.CLOUDINARY_API_KEY;
    const apiSecret = process.env.CLOUDINARY_API_SECRET;

    if (!cloudName || !apiKey || !apiSecret) {
      throw new Error("CLOUDINARY_NOT_CONFIGURED");
    }

    return { cloudName, apiKey, apiSecret };
  }

  private normalizeCloudinaryPath(value: unknown, fallback = "student") {
    return String(value || fallback)
      .trim()
      .replace(/[^a-z0-9_-]/gi, "_")
      .replace(/^_+|_+$/g, "")
      .toLowerCase() || fallback;
  }

  private async uploadImageToCloudinary(
    imageBase64: string,
    mimeType: string,
    folder: string,
    publicId: string
  ) {
    if (!imageBase64) {
      throw new Error("STUDENT_IMAGE_REQUIRED");
    }

    if (!/^image\/(png|jpe?g|webp)$/i.test(mimeType)) {
      throw new Error("STUDENT_IMAGE_INVALID_TYPE");
    }

    const { cloudName, apiKey, apiSecret } = this.getCloudinaryConfig();
    const uploadParams: Record<string, string> = {
      folder,
      overwrite: "true",
      public_id: publicId,
      timestamp: Math.floor(Date.now() / 1000).toString(),
    };
    const signaturePayload = Object.keys(uploadParams)
      .sort()
      .map((key) => `${key}=${uploadParams[key]}`)
      .join("&");
    const signature = crypto
      .createHash("sha1")
      .update(`${signaturePayload}${apiSecret}`)
      .digest("hex");
    const formData = new FormData();
    const dataUri = imageBase64.startsWith("data:")
      ? imageBase64
      : `data:${mimeType};base64,${imageBase64}`;

    formData.append("file", dataUri);
    formData.append("api_key", apiKey);
    formData.append("signature", signature);
    Object.entries(uploadParams).forEach(([key, value]) => {
      formData.append(key, value);
    });

    const uploadResponse = await fetch(
      `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
      {
        method: "POST",
        body: formData,
      }
    );
    const uploadResult: any = await uploadResponse.json();

    if (!uploadResponse.ok || !uploadResult.secure_url) {
      throw new Error(uploadResult?.error?.message || "CLOUDINARY_UPLOAD_FAILED");
    }

    return uploadResult.secure_url as string;
  }

  private normalizeIdPrefix(value: any, fallback: string) {
    const prefix = String(value || fallback)
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "");
    return prefix || fallback;
  }

  private normalizeIdTotalLength(value: any, prefix: string, fallback = 9) {
    const parsed = Number(value);
    const minimumLength = prefix.length + 1;
    if (!Number.isFinite(parsed) || parsed < minimumLength) {
      return Math.max(fallback, minimumLength);
    }
    return Math.floor(parsed);
  }

  private async getStudentKeyPrefix(client: string) {
    const account: any = await this.getAccountForStudentClient(client);
    const selectedOutlet = (account?.outlets || []).find(
      (outlet: any) =>
        String(outlet.outlet_key || "").toLowerCase() ===
        String(client || "").toLowerCase()
    );
    return this.normalizeKeyPrefix(
      selectedOutlet?.slip_key || account?.slip_key || account?.account_key || client
    );
  }

  private async getStudentIdSettings(client: string) {
    const account: any = await this.getAccountForStudentClient(client);
    const prefix = this.normalizeIdPrefix(account?.student_id_prefix, "STU");
    const totalLength = this.normalizeIdTotalLength(
      account?.student_id_total_length,
      prefix,
      9,
    );

    return {
      mode: account?.student_id_mode === "manual" ? "manual" : "auto",
      prefix,
      totalLength,
      digitLength: totalLength - prefix.length,
    };
  }

  private async getStudentIdMode(client: string) {
    return (await this.getStudentIdSettings(client)).mode;
  }

  private async getHighestStudentPaymentSequence(client: string, prefix: string) {
    const escapedClient = this.escapeRegex(client);
    const slipNumbers = await Student.aggregate([
      { $match: { client: { $regex: `^${escapedClient}$`, $options: "i" } } },
      { $unwind: "$courses" },
      { $unwind: "$courses.payments" },
      {
        $group: {
          _id: null,
          slip_numbers: { $addToSet: "$courses.payments.slip_number" },
        },
      },
      { $project: { _id: 0, slip_numbers: 1 } },
    ]);

    return (slipNumbers[0]?.slip_numbers ?? []).reduce(
      (highest: number, value: unknown) => {
        const slipNumber = String(value || "");
        if (!slipNumber.startsWith(prefix)) return highest;

        const suffix = slipNumber.slice(prefix.length);
        if (!/^\d{6}$/.test(suffix)) return highest;
        return Math.max(highest, Number(suffix));
      },
      0,
    );
  }

  private async getNextStudentPaymentSlipNumber(client: string, prefix: string) {
    const normalizedClient = String(client || "").trim().toLowerCase();
    const normalizedPrefix = String(prefix || "").trim().toUpperCase();
    const scope = `student_payment:${normalizedClient}:${normalizedPrefix}`;
    const existingHighest = await this.getHighestStudentPaymentSequence(
      client,
      normalizedPrefix,
    );

    await PaymentSequence.updateOne(
      { scope },
      {
        $max: { lastSequence: existingHighest },
        $set: {
          type: "student_payment",
          client,
          prefix: normalizedPrefix,
        },
        $setOnInsert: { scope },
      },
      { upsert: true },
    );

    const counter = await PaymentSequence.findOneAndUpdate(
      { scope },
      { $inc: { lastSequence: 1 } },
      { new: true },
    ).lean();

    if (!counter) throw new Error("PAYMENTS.SLIP_SEQUENCE_FAILED");
    return `${normalizedPrefix}${String(counter.lastSequence).padStart(6, "0")}`;
  }

  private async assertStudentKeyAvailable(client: string, studentKey: string, currentStudentId?: string) {
    const existing = await Student.findOne({
      client: { $regex: new RegExp(`^${this.escapeRegex(client)}$`, "i") },
      student_key: { $regex: new RegExp(`^${this.escapeRegex(studentKey)}$`, "i") },
      ...(currentStudentId ? { _id: { $ne: currentStudentId } } : {}),
      ...activeRecordFilter,
    }).lean();

    if (existing) throw new Error("STUDENTS.DUPLICATE_STUDENT_KEY");
  }

  private async generateStudentKey(client: string) {
    const settings = await this.getStudentIdSettings(client);
    const keyPrefix = settings.prefix;
    const latest = await Student.findOne({
      client: { $regex: new RegExp(`^${this.escapeRegex(client)}$`, "i") },
      student_key: {
        $regex: new RegExp(`^${this.escapeRegex(keyPrefix)}\\d{${settings.digitLength}}$`, "i"),
      },
    })
      .sort({ student_key: -1 })
      .select("student_key")
      .lean();
    const latestSequence = Number(String(latest?.student_key || "").slice(keyPrefix.length)) || 0;
    return `${keyPrefix}${String(latestSequence + 1).padStart(settings.digitLength, "0")}`;
  }

  private isDuplicateKeyError(error: any) {
    if (error?.code !== 11000 && !String(error?.message || "").includes("E11000")) {
      return false;
    }
    return (
      Boolean(error?.keyPattern?.student_key) ||
      Boolean(error?.keyValue?.student_key) ||
      String(error?.message || "").includes("student_key")
    );
  }

  private async ensureStudentKey(student: any) {
    if (!student || student.student_key) return student;

    for (let attempt = 0; attempt < 25; attempt += 1) {
      const studentKey = await this.generateStudentKey(student.client);
      try {
        const updated = await Student.findOneAndUpdate(
          {
            _id: student._id,
            $or: [
              { student_key: { $exists: false } },
              { student_key: null },
              { student_key: "" },
            ],
          },
          { $set: { student_key: studentKey } },
          { new: true }
        ).lean();

        if (updated) return { ...student, student_key: updated.student_key };

        const current = await Student.findById(student._id)
          .select("student_key")
          .lean();
        if (current?.student_key) return { ...student, student_key: current.student_key };
      } catch (error: any) {
        if (!this.isDuplicateKeyError(error)) throw error;
      }
    }

    throw new Error("STUDENTS.STUDENT_KEY_GENERATION_FAILED");
  }

  private async buildCertificateCourses(student: any) {
    const account: any = await this.getAccountForStudentClient(student.client);
    if (account?.certificate_needed === false) return [];
    const masterClients = [
      student.client,
      account?.account_key,
      account?.account_name,
    ].filter(Boolean);
    const master = await CourseMaster.findOne({
      client: { $in: masterClients },
    }).lean();
    const certificateCourseNames = new Set(
      (master?.courses || [])
        .filter((course: any) => course.is_certificate && course.status !== false)
        .map((course: any) => String(course.course_name || "").toLowerCase())
    );

    return (student.courses || [])
      .filter((course: any) => {
        const isCompleted = Boolean(course.course_end_date);
        const hasCertificateSetting = certificateCourseNames.has(
          String(course.course_name || "").toLowerCase()
        );
        return isCompleted && hasCertificateSetting;
      })
      .map((course: any) => ({
        course_id: String(course._id),
        course_name: course.course_name,
        course_duration: course.course_duration,
        course_start_date: course.course_start_date,
        course_end_date: course.course_end_date,
        account_name: account?.account_name || "E-TECH TRAINING CENTER",
        logo_url: account?.logo_url || "",
        signature: account?.signature || "",
        signature_trainer: account?.signature_trainer || "",
        certificate_needed: account?.certificate_needed !== false,
        certificate_template: account?.certificate_template || "blue",
      }));
  }

  private removeEmailVerificationInput(dto: any = {}) {
    delete dto.email_verified;
    delete dto.email_verified_at;
    delete dto.email_verification_token_hash;
    delete dto.email_verification_expires_at;
    delete dto.email_verification_sent_at;
  }

  private createEmailVerificationUpdate(email: string) {
    if (!email) {
      return {
        update: {
          email_verified: false,
          email_verified_at: null,
          email_verification_token_hash: "",
          email_verification_expires_at: null,
          email_verification_sent_at: null,
        },
      };
    }

    const verification = createEmailVerificationToken();
    return {
      token: verification.token,
      update: {
        email_verified: false,
        email_verified_at: null,
        email_verification_token_hash: verification.tokenHash,
        email_verification_expires_at: verification.expiresAt,
        email_verification_sent_at: null,
      },
    };
  }

  private async sendStudentVerificationEmail(student: any, token: string) {
    if (!student?.email || !token) return;

    await sendVerificationEmail({
      to: student.email,
      name: student.name || "there",
      subject: "Verify your E-Tech Suite student email",
      verificationUrl: buildEmailVerificationUrl("student", token),
    });

    await Student.findByIdAndUpdate(student._id, {
      email_verification_sent_at: new Date(),
    });
  }

  async create(createDto: any, payload: any = {}) {
    assertAllowedEmail(createDto.email);
    if (createDto.username) {
      createDto.username = String(createDto.username).trim().toLowerCase();
      if (await Student.exists({ client: createDto.client, username: createDto.username, ...activeRecordFilter })) throw new Error("Student username is already in use");
    }
    if (createDto.password) {
      if (String(createDto.password).length < 8) throw new Error("Password must be at least 8 characters");
      createDto.password = await bcrypt.hash(String(createDto.password), 10);
    } else delete createDto.password;
    this.removeEmailVerificationInput(createDto);
    delete createDto["_id"];
    const studentIdMode = await this.getStudentIdMode(createDto.client);
    const manualStudentKey = this.normalizeManualStudentKey(createDto.student_key);
    delete createDto["student_key"];

    if (studentIdMode === "manual") {
      if (!manualStudentKey) throw new Error("STUDENTS.STUDENT_KEY_REQUIRED");
      await this.assertStudentKeyAvailable(createDto.client, manualStudentKey);
    }

    const checkData: any = {
      ...activeRecordFilter,
      name: { $regex: new RegExp(`^${createDto.name}$`, "i") },
      client: { $regex: new RegExp(`^${createDto.client}$`, "i") },
    }
    if (createDto.fathers_name)
      checkData['fathers_name'] = { $regex: new RegExp(`^${createDto.fathers_name}$`, "i") }

    const existingDealer = await Student.findOne(checkData);

    if (existingDealer) {
      throw new Error("STUDENTS.DUPLICATE_STUDENT_CODE1");
    }

    const emailVerification = this.createEmailVerificationUpdate(
      String(createDto.email || "").trim()
    );

    let result: any = null;
    if (studentIdMode === "manual") {
      try {
        result = await Student.create({
          ...createDto,
          ...emailVerification.update,
          student_key: manualStudentKey,
        });
      } catch (error: any) {
        if (this.isDuplicateKeyError(error)) throw new Error("STUDENTS.DUPLICATE_STUDENT_KEY");
        throw error;
      }
    } else {
      for (let attempt = 0; attempt < 25; attempt += 1) {
        try {
          result = await Student.create({
            ...createDto,
            ...emailVerification.update,
            student_key: await this.generateStudentKey(createDto.client),
          });
          break;
        } catch (error: any) {
          if (!this.isDuplicateKeyError(error)) throw error;
        }
      }

      if (!result) throw new Error("STUDENTS.STUDENT_KEY_GENERATION_FAILED");
    }

    // Sync custom field labels to Account
    const createdCustomFields = createDto.custom_field || createDto.custom_fields || [];
    if (createdCustomFields.length > 0) {
      await this.syncCustomFieldLabels(createDto.client, createdCustomFields);
    }

    if (emailVerification.token) {
      try {
        await this.sendStudentVerificationEmail(result, emailVerification.token);
      } catch (error) {
        console.error("Student verification email failed:", error);
      }
    }

    return this.stripStudentSecrets(result.toObject());
  }

  async findAll(query: any, payload: any = {}) {
    const {
      client,
      dropdown,
      search,
      aadhar_number,
      name,
      status,
      product_type,
      fathers_name,
      phone_number,
      course_name,
      view,
      sortField,
      sortOrder = "asc",
      pageNum = 1,
      count = 10,
    } = query;

    const filterQuery: any = { ...activeRecordFilter };
    const projectionQuery: any = {};

    if (client) filterQuery.client = client;
    if (aadhar_number) filterQuery.aadhar_number = aadhar_number;
    if (status !== undefined && status !== "") filterQuery.status = Number(status);
    if (name) filterQuery.name = name;
    if (fathers_name) filterQuery.fathers_name = fathers_name;
    if (product_type) filterQuery.product_type = product_type;
    if (phone_number)
      filterQuery.phone_number = { $regex: phone_number, $options: "i" };
    if (course_name)
      filterQuery["courses.course_name"] = { $regex: course_name, $options: "i" };

    if (search) {
      filterQuery.$and = [
        {
          $or: [
            { aadhar_number: { $regex: search, $options: "i" } },
            { name: { $regex: search, $options: "i" } },
            { fathers_name: { $regex: search, $options: "i" } },
            { phone_number: { $regex: search, $options: "i" } },
          ],
        },
      ];
    }

    if (view === "list") {
      const allowedListSortFields = new Set([
        "student_key",
        "name",
        "fathers_name",
        "dob",
        "phone_number",
        "whatsapp_number",
        "class_batch",
        "course_start_date",
        "total_pending_fee",
        "total_pending_fee_till_date",
      ]);
      const listSortField = allowedListSortFields.has(String(sortField || ""))
        ? String(sortField)
        : "student_key";
      const listSortOrder = String(sortOrder).toLowerCase() === "desc" ? -1 : 1;
      const page = Math.max(Number(pageNum) || 1, 1);
      const limit = Math.max(Number(count) || 10, 1);
      const skip = (page - 1) * limit;
      const totalData = await Student.countDocuments(filterQuery);

      const result = await Student.aggregate([
        { $match: filterQuery },
        {
          $project: {
            name: 1,
            fathers_name: 1,
            dob: 1,
            phone_number: 1,
            whatsapp_number: 1,
            class_batch: 1,
            total_pending_fee: 1,
            total_pending_fee_till_date: 1,
            status: 1,
            client: 1,
            student_key: 1,
            course_start_date: {
              $let: {
                vars: {
                  activeCourse: {
                    $first: {
                      $filter: {
                        input: { $ifNull: ["$courses", []] },
                        as: "course",
                        cond: {
                          $and: [
                            { $ne: ["$$course.deleted", true] },
                            { $eq: ["$$course.course_status", 1] },
                          ],
                        },
                      },
                    },
                  },
                },
                in: "$$activeCourse.course_start_date",
              },
            },
          },
        },
        { $sort: { [listSortField]: listSortOrder, _id: 1 } },
        { $skip: skip },
        { $limit: limit },
      ]);

      const withKeys = [];
      for (const student of result) {
        withKeys.push(await this.ensureStudentKey(student));
      }

      const list = withKeys.map((student) =>
        this.stripStudentSecrets({
          ...student,
          status: student.status === 1,
        })
      );

      return {
        list,
        metaData: {
          pageNum: page,
          count: limit,
          totalData,
        },
      };
    }

    if (dropdown === "true") {
      projectionQuery.courses = 0;
      projectionQuery.custom_field = 0;
    } else {
      projectionQuery.name = 1;
      projectionQuery.fathers_name = 1;
      projectionQuery.dob = 1;
      projectionQuery.phone_number = 1;
      projectionQuery.whatsapp_number = 1;
      projectionQuery.class_batch = 1;
      projectionQuery.total_pending_fee = 1;
      projectionQuery.total_pending_fee_till_date = 1;
      projectionQuery.status = 1;
      projectionQuery.client = 1;
      projectionQuery.custom_field = 1;
      projectionQuery["courses.course_name"] = 1;
      projectionQuery["courses.course_status"] = 1;
      projectionQuery["courses.course_start_date"] = 1;
    }

    const result = await Student.find(filterQuery, projectionQuery)
      .sort({ createdAt: 1 })
      .lean();

    const withKeys = [];
    for (const student of result) {
      withKeys.push(await this.ensureStudentKey(student));
    }

    return withKeys.map((e) => this.stripStudentSecrets({
      ...e,
      status: e.status === 1,
    }));
  }

  async findById(id: string, payload: any = {}) {
    const result = await Student.findOne({ _id: id, ...activeRecordFilter }).lean();
    if (!result) throw new Error("STUDENTS.NOT_FOUND");
    return this.stripStudentSecrets(await this.ensureStudentKey(result));
  }

  async update(id: string, updateDto: any, payload: any = {}) {
    assertAllowedEmail(updateDto.email);
    this.removeEmailVerificationInput(updateDto);
    delete updateDto["_id"];

    if (updateDto.aadhar_number) {
      const existingDealer = await Student.findOne({
        aadhar_number: updateDto.aadhar_number,
        _id: { $ne: id },
      });
      if (existingDealer) {
        throw new Error("STUDENTS.DUPLICATE_STUDENT_CODE");
      }
    }

    if (updateDto?.client) delete updateDto.client;

    const currentDocument = await Student.findOne({ _id: id, ...activeRecordFilter }).lean();
    if (!currentDocument) throw new Error("STUDENTS.NOT_FOUND");
    if (updateDto.username) {
      updateDto.username = String(updateDto.username).trim().toLowerCase();
      if (await Student.exists({ _id: { $ne: id }, client: currentDocument.client, username: updateDto.username, ...activeRecordFilter })) throw new Error("Student username is already in use");
    }
    if (updateDto.password) {
      if (String(updateDto.password).length < 8) throw new Error("Password must be at least 8 characters");
      updateDto.password = await bcrypt.hash(String(updateDto.password), 10);
    } else delete updateDto.password;

    const hasStudentKeyInput = Object.prototype.hasOwnProperty.call(updateDto, "student_key");
    const studentIdMode = await this.getStudentIdMode(currentDocument.client);
    if (studentIdMode === "manual" && hasStudentKeyInput) {
      const manualStudentKey = this.normalizeManualStudentKey(updateDto.student_key);
      if (!manualStudentKey) throw new Error("STUDENTS.STUDENT_KEY_REQUIRED");
      await this.assertStudentKeyAvailable(currentDocument.client, manualStudentKey, id);
      updateDto.student_key = manualStudentKey;
    } else {
      delete updateDto["student_key"];
    }

    const incomingEmail =
      typeof updateDto.email === "string" ? updateDto.email.trim() : undefined;
    const emailChanged =
      incomingEmail !== undefined &&
      incomingEmail.toLowerCase() !== String(currentDocument.email || "").toLowerCase();
    const emailVerification = emailChanged
      ? this.createEmailVerificationUpdate(incomingEmail)
      : null;

    const result = await Student.findOneAndUpdate({ _id: id, ...activeRecordFilter }, updateDto, {
      new: true,
    }).lean();
    if (!result) throw new Error("STUDENTS.NOT_FOUND");
    await this.calculatePendingFee(id);

    // Sync custom field labels to Account
    const updatedCustomFields = updateDto.custom_field || updateDto.custom_fields || [];
    if (updatedCustomFields.length > 0) {
      await this.syncCustomFieldLabels(result.client, updatedCustomFields);
    }

    if (emailVerification?.update) {
      const updatedWithVerification = await Student.findByIdAndUpdate(
        id,
        emailVerification.update,
        { new: true }
      ).lean();
      if (updatedWithVerification) {
        Object.assign(result, updatedWithVerification);
      }
    }

    if (emailVerification?.token) {
      try {
        await this.sendStudentVerificationEmail(result, emailVerification.token);
      } catch (error) {
        console.error("Student verification email failed:", error);
      }
    }

    return this.stripStudentSecrets(result);
  }

  async uploadStudentImage(id: string, uploadDto: any, payload: any = {}) {
    const currentDocument = await Student.findOne({ _id: id, ...activeRecordFilter }).lean();
    if (!currentDocument) throw new Error("STUDENTS.NOT_FOUND");

    const account: any = await this.getAccountForStudentClient(currentDocument.client);
    const accountKey = this.normalizeCloudinaryPath(
      account?.account_key || currentDocument.client,
      "account"
    );
    const studentPublicId = this.normalizeCloudinaryPath(
      currentDocument.student_key || currentDocument._id,
      "student"
    );

    const imageUrl = await this.uploadImageToCloudinary(
      String(uploadDto?.imageBase64 || ""),
      String(uploadDto?.mimeType || "image/jpeg"),
      `student-image/${accountKey}`,
      studentPublicId
    );

    const result = await Student.findByIdAndUpdate(
      id,
      { image_url: imageUrl },
      { new: true }
    ).lean();
    if (!result) throw new Error("STUDENTS.NOT_FOUND");

    return this.stripStudentSecrets(result);
  }

  async sendEmailVerification(id: string, payload: any = {}) {
    const student = await Student.findOne({ _id: id, ...activeRecordFilter }).lean();
    if (!student) throw new Error("STUDENTS.NOT_FOUND");
    if (!student.email) throw new Error("EMAIL_REQUIRED");

    const emailVerification = this.createEmailVerificationUpdate(student.email);
    const result = await Student.findByIdAndUpdate(
      id,
      emailVerification.update,
      { new: true }
    ).lean();
    if (!result) throw new Error("STUDENTS.NOT_FOUND");

    if (emailVerification.token) {
      await this.sendStudentVerificationEmail(result, emailVerification.token);
    }

    return this.stripStudentSecrets(result);
  }

  async verifyEmail(token: string) {
    const tokenHash = hashEmailVerificationToken(String(token || ""));
    const result = await Student.findOneAndUpdate(
      {
        email_verification_token_hash: tokenHash,
        email_verification_expires_at: { $gt: new Date() },
      },
      {
        email_verified: true,
        email_verified_at: new Date(),
        email_verification_token_hash: "",
        email_verification_expires_at: null,
      },
      { new: true }
    ).lean();

    if (!result) throw new Error("EMAIL_VERIFICATION_INVALID_OR_EXPIRED");
    return this.stripStudentSecrets(result);
  }

  private async findStudentByAccountCodeAndKey(accountCode: string, studentKey: string, extraFilter: Record<string, any> = {}) {
    const account = await Account.findOne({
      account_code: { $regex: new RegExp(`^${this.escapeRegex(String(accountCode || "").trim())}$`, "i") },
      status: { $ne: 0 },
    }).lean();
    if (!account) throw new Error("ACCOUNTS.NOT_FOUND");

    return Student.findOne({
      ...activeRecordFilter,
      ...extraFilter,
      client: { $regex: new RegExp(`^${this.escapeRegex(String(account.account_key || "").trim())}$`, "i") },
      student_key: { $regex: new RegExp(`^${this.escapeRegex(String(studentKey || "").trim())}$`, "i") },
    }).lean();
  }

  async requestResultOtp(accountCode: string, studentKey: string) {
    const student = await this.findStudentByAccountCodeAndKey(accountCode, studentKey);
    if (!student) throw new Error("STUDENTS.NOT_FOUND");
    if (!student.email) throw new Error("EMAIL_REQUIRED");

    const otp = String(crypto.randomInt(100000, 1000000));
    const otpTtlMinutes = Number(process.env.RESULT_OTP_TTL_MINUTES || 10);
    await Student.findByIdAndUpdate(student._id, {
      result_otp_hash: this.hashOtp(otp),
      result_otp_expires_at: new Date(Date.now() + otpTtlMinutes * 60 * 1000),
      result_otp_sent_at: new Date(),
    });

    await sendOtpEmail({
      to: student.email,
      name: student.name,
      otp,
    });

    return {
      student_key: student.student_key,
      email: this.maskEmail(student.email),
      expires_in_minutes: otpTtlMinutes,
    };
  }

  async verifyResultOtp(accountCode: string, studentKey: string, otp: string) {
    const student = await this.findStudentByAccountCodeAndKey(accountCode, studentKey, {
      result_otp_hash: this.hashOtp(String(otp || "")),
      result_otp_expires_at: { $gt: new Date() },
    });
    if (!student) throw new Error("RESULT_OTP_INVALID_OR_EXPIRED");

    await Student.findByIdAndUpdate(student._id, {
      result_otp_hash: "",
      result_otp_expires_at: null,
    });

    const normalizedStudent = await this.ensureStudentKey(student);
    return {
      student: this.stripStudentSecrets({
        _id: normalizedStudent._id,
        student_key: normalizedStudent.student_key,
        name: normalizedStudent.name,
        email: this.maskEmail(normalizedStudent.email),
      }),
      certificates: await this.buildCertificateCourses(normalizedStudent),
    };
  }

  async changeStatus(id: string, payload: any = {}) {
    const foundDealer = await Student.findOne({ _id: id, ...activeRecordFilter }).lean();
    if (!foundDealer) throw new Error("STUDENTS.NOT_FOUND");

    return await Student.findByIdAndUpdate(
      id,
      { status: foundDealer.status ? 0 : 1 },
      { new: true },
    ).lean();
  }

  async importBulk(productData: any[], payload: any = {}) {
    const updateResults = [];

    for (const row of productData) {
      const { _id, aadhar_number, ...restData } = row;

      if (restData?.courses?.length) {
        restData.courses = restData.courses.map((course: any) => {
          course.course_status = course.course_status ? 1 : 0;
          return course;
        });
      }

      if (_id) {
      const existingDealer = await Student.findOne({ _id, ...activeRecordFilter });
        if (existingDealer) {
          existingDealer.set({
            aadhar_number,
            ...restData,
            status: restData?.status ? 1 : 0,
          });
          await existingDealer.save();
          await this.calculatePendingFee(existingDealer._id.toString());
          updateResults.push({ _id, aadhar_number, status: "updated" });
        }
      } else {
        const newDealer = new Student({
          aadhar_number,
          ...restData,
          status: restData?.status ? 1 : 0,
        });
        await newDealer.save();
        await this.calculatePendingFee(newDealer._id.toString());
        updateResults.push({ aadhar_number, status: "created" });
      }
    }
    return updateResults;
  }

  async delete(id: string, payload: any = {}) {
    if (payload?.userRole?.toLowerCase() === "user") {
      throw new Error("User role not authorized to delete students");
    }
    const student = await Student.findOne({ _id: id, ...activeRecordFilter });
    if (!student) throw new Error("STUDENTS.NOT_FOUND");
    await Student.findByIdAndUpdate(id, { $set: getSoftDeleteUpdate(payload) });
    return null;
  }

  // Payment Logic
  async addPayment(student_id: string, course_id: string, paymentDto: any, payload: any = {}) {
    if (payload?.userRole?.toLowerCase() === "user") {
        // Option to restrict adding payments if needed, but requirements say "add and list is shown"
    }
    const object = await Student.findOne({ _id: student_id, ...activeRecordFilter }).exec();
    if (!object) throw new Error("PAYMENTS.DOES_NOT_EXISTS");

    const courseExists = object.courses.find(
      (course: any) => course?.deleted !== true && course?._id?.toString() == course_id,
    );
    if (!courseExists) throw new Error("PAYMENTS.DOES_NOT_EXISTS");

    // Prefer the selected outlet slip key, then the account key, then client fallback.
    const escapedClient = object.client.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const account: any = await Account.findOne({
      $or: [
        { account_name: { $regex: new RegExp(`^${escapedClient}$`, "i") } },
        { account_key: { $regex: new RegExp(`^${escapedClient}$`, "i") } },
        { "outlets.outlet_key": { $regex: new RegExp(`^${escapedClient}$`, "i") } },
      ],
    })
      .select("slip_key outlets.outlet_key outlets.slip_key")
      .lean();

    const client = object.client.toUpperCase();
    const fallbackPrefix = client.includes("_")
      ? client
        .split("_")
        .map((word) => word.charAt(0))
        .join("")
      : client.substring(0, 4);

    const selectedOutlet = (account?.outlets || []).find(
      (outlet: any) =>
        String(outlet.outlet_key || "").toLowerCase() === object.client.toLowerCase(),
    );
    const configuredPrefix = String(selectedOutlet?.slip_key || account?.slip_key || "")
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "");
    const prefix = configuredPrefix || fallbackPrefix;
    const slipNumber = await this.getNextStudentPaymentSlipNumber(
      object.client,
      prefix,
    );
    const paymentData = { ...paymentDto, slip_number: slipNumber };

    const courseIndex = object.courses.findIndex(
      (course: any) => course?.deleted !== true && course?._id?.toString() === course_id,
    );
    if (courseIndex === -1) throw new Error("PAYMENTS.DOES_NOT_EXISTS");

    const updateObj: any = { $push: { [`courses.${courseIndex}.payments`]: paymentData } };

    const update = await Student.findOneAndUpdate(
      { _id: student_id, ...activeRecordFilter },
      updateObj,
      { new: true },
    ).exec();

    if (!update) throw new Error("PAYMENTS.DOES_NOT_EXISTS");
    return update;
  }

  async updatePayment(
    paymentId: string,
    student_id: string,
    course_id: string,
    paymentUpdateDto: any,
    payload: any = {}
  ) {
    const student = await Student.findOne({ _id: student_id, ...activeRecordFilter }).exec();
    if (!student) throw new Error("PAYMENTS.DOES_NOT_EXIST");

    const course = student.courses.find((v: any) => v.deleted !== true && v._id?.toString() === course_id);
    if (!course) throw new Error("PAYMENTS.DOES_NOT_EXIST");

    const paymentIndex = course.payments.findIndex(
      (c: any) => c.deleted !== true && c._id?.toString() === paymentId,
    );
    if (paymentIndex === -1) throw new Error("PAYMENTS.DOES_NOT_EXIST");

    if (Number(course.course_status) === 0) {
      // Pending fee is dynamically calculated later based on end_date, so no need to manually compute here
    }

    Object.keys(paymentUpdateDto).forEach((key) => {
      (course.payments[paymentIndex] as any)[key] = paymentUpdateDto[key];
    });

    await student.save();
    return student;
  }

  async deletePayment(
    paymentId: string,
    student_id: string,
    course_id: string,
    payload: any = {}
  ) {
    if (payload?.userRole?.toLowerCase() === "user") {
      throw new Error("User role not authorized to delete payments");
    }
    const student = await Student.findOne({ _id: student_id, ...activeRecordFilter }).exec();
    if (!student) throw new Error("PAYMENTS.NOT_FOUND");

    const course = student.courses.find((c: any) => c.deleted !== true && c._id.toString() === course_id);
    if (!course) throw new Error("PAYMENTS.NOT_FOUND");

    const payment = course.payments.find((p: any) => p.deleted !== true && p._id.toString() === paymentId);
    if (!payment) throw new Error("PAYMENTS.NOT_FOUND");

    const deleteUpdate = getSoftDeleteUpdate(payload);

    const result = await Student.updateOne(
      {
        _id: student_id,
        "courses._id": course_id,
        "courses.payments._id": paymentId,
        ...activeRecordFilter,
      },
      {
        $set: {
          "courses.$[course].payments.$[payment].deleted": true,
          "courses.$[course].payments.$[payment].deleted_at": deleteUpdate.deleted_at,
          "courses.$[course].payments.$[payment].deleted_by": deleteUpdate.deleted_by,
        },
      },
      {
        arrayFilters: [
          { "course._id": new mongoose.Types.ObjectId(course_id), "course.deleted": { $ne: true } },
          { "payment._id": new mongoose.Types.ObjectId(paymentId), "payment.deleted": { $ne: true } },
        ],
      }
    );

    if (result.modifiedCount === 0) throw new Error("PAYMENTS.NOT_FOUND");
    return null;
  }

  // Course Logic
  async createCourse(student_id: string, courseDto: any, payload: any = {}) {
    const object = await Student.findOne({ _id: student_id, ...activeRecordFilter }).exec();
    if (!object) throw new Error("COURSE.DOES_NOT_EXISTS");
    const normalizedCourseDto = {
      ...courseDto,
      total_course_fee: this.getTotalCourseFee(courseDto),
    };

    const update = await Student.findOneAndUpdate(
      { _id: student_id, ...activeRecordFilter },
      { $push: { courses: normalizedCourseDto } },
      { new: true },
    ).exec();

    if (!update) throw new Error("COURSE.DOES_NOT_EXISTS");
    return update;
  }

  async updateCourse(courseId: string, student_id: string, courseData: any, payload: any = {}) {
    const { _id, ...updatedFields } = courseData;
    if (Object.prototype.hasOwnProperty.call(updatedFields, "course_end_date")) {
      updatedFields.course_end_date = updatedFields.course_end_date
        ? moment(updatedFields.course_end_date).toISOString()
        : "";
    }

    const object = await Student.findOne({ _id: student_id, ...activeRecordFilter }).exec();
    if (!object) throw new Error("COURSE.DOES_NOT_EXISTS");

    const courseIndex = object.courses.findIndex(
      (course: any) => course.deleted !== true && course._id?.toString() === courseId,
    );
    if (courseIndex === -1) throw new Error("COURSE.DOES_NOT_EXISTS");
    const existingCourse = object.courses[courseIndex] as any;
    const existingCourseObject =
      typeof existingCourse?.toObject === "function"
        ? existingCourse.toObject()
        : existingCourse;
    const mergedCourse = {
      ...existingCourseObject,
      ...updatedFields,
    };
    updatedFields.total_course_fee = this.getTotalCourseFee(mergedCourse);

    const setQuery: any = {};
    Object.keys(updatedFields).forEach((key) => {
      setQuery[`courses.${courseIndex}.${key}`] = updatedFields[key];
    });

    const update = await Student.findOneAndUpdate(
      { _id: student_id, ...activeRecordFilter },
      { $set: setQuery },
      { new: true },
    ).exec();

    if (!update) throw new Error("COURSE.UPDATE_FAILED");
    return update;
  }

  async deleteCourse(courseId: string, student_id: string, payload: any = {}) {
    const deleteUpdate = getSoftDeleteUpdate(payload);
    const result = await Student.updateOne(
      { _id: student_id, "courses._id": courseId, "courses.deleted": { $ne: true }, ...activeRecordFilter },
      {
        $set: {
          "courses.$.deleted": true,
          "courses.$.deleted_at": deleteUpdate.deleted_at,
          "courses.$.deleted_by": deleteUpdate.deleted_by,
        },
      },
    );

    return null;
  }

  async updateCourseStatus(
    courseId: string,
    student_id: string,
    status: number,
    payload: any = {}
  ) {
    const nextStatus = Number(status);
    const updateQuery: any = { "courses.$[course].course_status": nextStatus };
    if (nextStatus === 0) {
      updateQuery["courses.$[course].course_end_date"] = moment().toISOString();
    } else {
      updateQuery["courses.$[course].course_end_date"] = "";
    }
    const res = await Student.findOneAndUpdate(
      { _id: student_id, ...activeRecordFilter },
      { $set: updateQuery },
      {
        arrayFilters: [{ "course._id": new mongoose.Types.ObjectId(courseId), "course.deleted": { $ne: true } }],
        new: true,
        runValidators: true,
      },
    );
    if (!res) {
      throw new Error("COURSE.NOT_FOUND");
    }
    return res;
  }

  private _calculateStudentFees(student: any) {
    let totalPending = 0;
    let totalPendingTillDate = 0;
    const today = moment();

    const updatedCourses = student.courses.map((course: any) => {
      if (course.deleted === true) {
        course.pending_fee = 0;
        course.pending_fee_till_date = 0;
        return course;
      }
      const fee = parseFloat(course.course_fee) || 0;
      const freq = course.fee_ferquency as PaymentFrequency;
      const startDate = moment(course.course_start_date && course.course_start_date !== "" ? course.course_start_date : student.createdAt);

      const targetDate = Number(course.course_status) === 0
        ? (course.course_end_date ? moment(course.course_end_date) : moment(course.updatedAt || startDate))
        : today;

      let periodsDue = 0;
      let maxPeriods = 1;
      const durationMonths = this.getCourseDurationMonths(course);
      const maxMonths = durationMonths || Infinity;

      const diffMonths = targetDate.diff(startDate, "months");
      const diffYears = targetDate.diff(startDate, "years");

      switch (freq) {
        case PaymentFrequency.MONTHLY:
          periodsDue = diffMonths + 1;
          maxPeriods = maxMonths;
          break;
        case PaymentFrequency.QUATERLY:
          periodsDue = Math.floor(diffMonths / 3) + 1;
          maxPeriods = Math.ceil(maxMonths / 3);
          break;
        case PaymentFrequency.HALF_YEARLY:
          periodsDue = Math.floor(diffMonths / 6) + 1;
          maxPeriods = Math.ceil(maxMonths / 6);
          break;
        case PaymentFrequency.YEARLY:
          periodsDue = diffYears + 1;
          maxPeriods = Math.ceil(maxMonths / 12);
          break;
        case PaymentFrequency.LUM_SUM:
          periodsDue = 1;
          maxPeriods = 1;
          break;
        default:
          periodsDue = diffMonths + 1;
          maxPeriods = maxMonths;
      }

      if (maxPeriods <= 0 || maxPeriods === Infinity || isNaN(maxPeriods)) maxPeriods = 1;
      course.total_course_fee = this.getTotalCourseFee(course);

      const cappedPeriodsDue = Math.max(Math.min(periodsDue, maxPeriods), 0);
      const expected = (fee * cappedPeriodsDue) + (course.registration_required ? (Number(course.registration_fee) || 0) : 0);
      const totalPaid = course.payments
        .filter((p: any) => p.deleted !== true)
        .reduce(
          (sum: number, p: any) => p.payment_status === PaymentStatus.REJECTED ? sum : sum + Number(p.payment_amount || 0),
          0,
        );
      const pendingTillDate = Math.max(Math.ceil(expected - totalPaid), 0);
      const totalExpected = this.getTotalCourseFee(course)
        + (course.registration_required ? (Number(course.registration_fee) || 0) : 0);
      const pending = Math.max(Math.ceil(totalExpected - totalPaid), 0);

      course.pending_fee = pending;
      course.pending_fee_till_date = pendingTillDate;
      
      // Only sum active courses into the total student pending fee
      if (Number(course.course_status) === 1) {
        totalPending += pending;
        totalPendingTillDate += pendingTillDate;
      }
      
      return course;
    });

    student.courses = updatedCourses;
    student.total_pending_fee = Math.round(totalPending);
    student.total_pending_fee_till_date = Math.round(totalPendingTillDate);
    student.markModified('courses');
    return {
      totalPending: student.total_pending_fee,
      totalPendingTillDate: student.total_pending_fee_till_date,
    };
  }

  async calculatePendingFee(studentId: string, payload: any = {}) {
    const student = await Student.findOne({ _id: studentId, ...activeRecordFilter });
    if (!student) throw new Error("STUDENTS.NOT_FOUND");
    
    const totals = this._calculateStudentFees(student);
    await student.save();

    return { student, ...totals };
  }

  async updatePendingFeesByClient(client: string, payload: any = {}) {
    const students = await Student.find({
      ...activeRecordFilter,
      client: { $regex: new RegExp(`^${client}$`, "i") },
    });
    if (!students.length)
      throw new Error(`No students found for client ${client}`);

    const updateResults = [];

    for (const student of students) {
      const totals = this._calculateStudentFees(student);
      await student.save();

      updateResults.push({
        studentId: student._id,
        name: student.name,
        total_pending_fee: totals.totalPending,
        total_pending_fee_till_date: totals.totalPendingTillDate,
      });
    }
    return {
      client,
      updatedStudentsCount: updateResults.length,
      results: updateResults,
    };
  }

  async findAllPayments(query: any, payload: any = {}) {
    const { client, search, pageNum = 1, count = 10, year, month } = query;
    const skip = (Number(pageNum) - 1) * Number(count);
    const limit = Number(count);
    const pipeline: any[] = [];

    // Filter by client
    if (client) {
      pipeline.push({ $match: { ...activeRecordFilter, client: client } });
    }

    // Unwind courses and payments
    pipeline.push({ $unwind: "$courses" });
    pipeline.push({ $match: { "courses.deleted": { $ne: true } } });
    pipeline.push({ $unwind: "$courses.payments" });
    pipeline.push({ $match: { "courses.payments.deleted": { $ne: true } } });

    // Filter by year and month if provided
    if (year) {
      pipeline.push({
        $match: {
          $expr: {
            $eq: [
              { $year: { $dateFromString: { dateString: "$courses.payments.payment_date" } } },
              Number(year)
            ]
          }
        }
      });
    }
    if (month && month !== "") {
      pipeline.push({
        $match: {
          $expr: {
            $eq: [
              { $month: { $dateFromString: { dateString: "$courses.payments.payment_date" } } },
              Number(month) + 1
            ]
          }
        }
      });
    }

    // Project fields
    pipeline.push({
      $project: {
        _id: "$courses.payments._id",
        student_id: "$_id",
        course_id: "$courses._id",
        student_name: "$name",
        student_whatsapp_number: "$whatsapp_number",
        student_fathers_name: "$fathers_name",
        slip_number: "$courses.payments.slip_number",
        payment_amount: "$courses.payments.payment_amount",
        payment_date: "$courses.payments.payment_date",
        remarks: "$courses.payments.remarks",
        payment_status: "$courses.payments.payment_status",
        payment_mode: "$courses.payments.payment_mode",
        course_name: "$courses.course_name",
        createdAt: "$courses.payments.createdAt"
      }
    });

    // Search filter
    if (search) {
      pipeline.push({
        $match: {
          $or: [
            { student_name: { $regex: search, $options: "i" } },
            { slip_number: { $regex: search, $options: "i" } },
            { remarks: { $regex: search, $options: "i" } }
          ]
        }
      });
    }

    // Sort by createdAt descending
    pipeline.push({ $sort: { createdAt: -1 } });

    // Pagination
    const facet: any = {
      data: [{ $skip: skip }, { $limit: limit }],
      totalCount: [{ $count: "count" }]
    };

    pipeline.push({ $facet: facet });

    const result = await Student.aggregate(pipeline);

    const payments = result[0].data;
    const totalCount = result[0].totalCount[0]?.count || 0;

    return {
      payments,
      totalCount,
      pageNum: Number(pageNum),
      count: limit
    };
  }

  async getPaymentReceipt(paymentId: string) {
    const pipeline: any[] = [];
    
    // We only want the specific payment
    pipeline.push({ $match: { ...activeRecordFilter, "courses.payments._id": new mongoose.Types.ObjectId(paymentId) } });
    
    // Unwind courses and payments
    pipeline.push({ $unwind: "$courses" });
    pipeline.push({ $match: { "courses.deleted": { $ne: true } } });
    pipeline.push({ $unwind: "$courses.payments" });
    
    // Match the specific payment again after unwind to filter out other payments of the same student
    pipeline.push({
      $match: {
        "courses.payments._id": new mongoose.Types.ObjectId(paymentId),
        "courses.payments.deleted": { $ne: true },
      },
    });

    // Project fields needed for the receipt
    pipeline.push({
      $project: {
        _id: "$courses.payments._id",
        student_id: "$_id",
        client: "$client",
        course_id: "$courses._id",
        student_name: "$name",
        student_fathers_name: "$fathers_name",
        slip_number: "$courses.payments.slip_number",
        payment_amount: "$courses.payments.payment_amount",
        payment_date: "$courses.payments.payment_date",
        remarks: "$courses.payments.remarks",
        payment_status: "$courses.payments.payment_status",
        payment_mode: "$courses.payments.payment_mode",
        course_name: "$courses.course_name",
        createdAt: "$courses.payments.createdAt"
      }
    });

    // Lookup account details manually OR via aggregation
    pipeline.push({
      $lookup: {
        from: "accounts",
        let: { recordClient: "$client" },
        pipeline: [
          {
            $match: {
              $expr: {
                $or: [
                  { $eq: ["$account_key", "$$recordClient"] },
                  {
                    $in: [
                      "$$recordClient",
                      { $ifNull: ["$outlets.outlet_key", []] },
                    ],
                  },
                ],
              },
            },
          },
        ],
        as: "accountData"
      }
    });

    pipeline.push({
      $unwind: {
        path: "$accountData",
        preserveNullAndEmptyArrays: true
      }
    });

    pipeline.push({
      $addFields: {
        account_name: { $ifNull: ["$accountData.account_name", "E-TECH TRAINING CENTER"] }
      }
    });

    pipeline.push({
      $project: {
        accountData: 0,
        client: 0 // depending on if you still need it, can be excluded
      }
    });

    const result = await Student.aggregate(pipeline);
    if (!result || result.length === 0) {
      throw new Error("PAYMENTS.NOT_FOUND");
    }

    return result[0];
  }

  async getCertificate(studentId: string, courseId: string) {
    const pipeline: any[] = [];
    
    // Match the specific student
    pipeline.push({ $match: { ...activeRecordFilter, _id: new mongoose.Types.ObjectId(studentId) } });
    
    // Unwind courses
    pipeline.push({ $unwind: "$courses" });
    
    // Match the specific course
    pipeline.push({
      $match: {
        "courses._id": new mongoose.Types.ObjectId(courseId),
        "courses.deleted": { $ne: true },
      },
    });

    // Project fields needed for the certificate
    pipeline.push({
      $project: {
        student_id: "$_id",
        client: "$client",
        student_name: "$name",
        student_whatsapp_number: "$whatsapp_number",
        course_id: "$courses._id",
        course_name: "$courses.course_name",
        course_duration: "$courses.course_duration",
        course_start_date: "$courses.course_start_date",
        course_end_date: "$courses.course_end_date",
        is_certificate: "$courses.is_certificate"
      }
    });

    // Lookup account details
    pipeline.push({
      $lookup: {
        from: "accounts",
        let: { recordClient: "$client" },
        pipeline: [
          {
            $match: {
              $expr: {
                $or: [
                  { $eq: ["$account_key", "$$recordClient"] },
                  {
                    $in: [
                      "$$recordClient",
                      { $ifNull: ["$outlets.outlet_key", []] },
                    ],
                  },
                ],
              },
            },
          },
        ],
        as: "accountData"
      }
    });

    pipeline.push({
      $unwind: {
        path: "$accountData",
        preserveNullAndEmptyArrays: true
      }
    });

    pipeline.push({
      $addFields: {
        account_name: { $ifNull: ["$accountData.account_name", "E-TECH TRAINING CENTER"] },
        logo_url: { $ifNull: ["$accountData.logo_url", ""] },
        signature: { $ifNull: ["$accountData.signature", ""] },
        signature_trainer: { $ifNull: ["$accountData.signature_trainer", ""] },
        certificate_needed: { $ifNull: ["$accountData.certificate_needed", true] },
        certificate_template: { $ifNull: ["$accountData.certificate_template", "blue"] }
      }
    });

    // Optionally cleanup accountData
    pipeline.push({
      $project: {
        accountData: 0,
        client: 0
      }
    });

    const result = await Student.aggregate(pipeline);
    if (!result || result.length === 0 || result[0]?.certificate_needed === false) {
      throw new Error("STUDENT_OR_COURSE_NOT_FOUND");
    }

    return result[0];
  }

  private async syncCustomFieldLabels(client: string, customFields: { label: string }[]) {
    if (!client || !customFields || customFields.length === 0) return;
    const labels = customFields.map(f => f.label);
    await Account.findOneAndUpdate(
      { $or: [{ account_name: client }, { account_key: client }] },
      { $addToSet: { custom_student_fields: { $each: labels } } }
    );
  }
}
