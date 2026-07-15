import Account from '../Account/model/Account';
import User from '../User/model/User';
import { ENUM_USER_TYPES } from '../../enums/userEnums';
import crypto from 'crypto';
import { assertAllowedEmail } from '../../utils/emailValidation';
import {
    buildEmailVerificationUrl,
    createEmailVerificationToken,
    hashEmailVerificationToken,
    stripEmailVerificationSecrets,
} from '../../utils/emailVerification';
import { sendVerificationEmail } from '../../utils/resendMailer';
import { getSoftDeleteUpdate } from '../../utils/softDelete';

export class AccountService {
    private buildDefaultOutlet(account: any) {
        return {
            outlet_name: account.account_name,
            outlet_key: account.account_key,
            location: account.company_address || "",
            company_address: account.company_address || "",
            country: account.country || "",
            state: account.state || "",
            city: account.city || "",
            postal_code: account.postal_code || "",
            contact_number: account.contact_number || "",
            email: account.email || "",
            status: 1,
            is_default: true,
        };
    }

    private slugifyOutletName(value: string) {
        return String(value || "")
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "_")
            .replace(/^_+|_+$/g, "");
    }

    private normalizeSlipKey(value: unknown) {
        return String(value || "")
            .trim()
            .toUpperCase()
            .replace(/[^A-Z0-9]/g, "");
    }

    private assertOutletSlipKeyAvailable(
        slipKey: string,
        account: any,
        outletId?: string
    ) {
        if (!slipKey) return;

        const duplicate =
            String(account.slip_key || "").toUpperCase() === slipKey ||
            (account.outlets || []).some((outlet: any) =>
                outlet.deleted !== true &&
                String(outlet.slip_key || "").toUpperCase() === slipKey &&
                (!outletId || String(outlet._id) !== outletId)
            );

        if (duplicate) throw new Error("SLIP_KEY_ALREADY_EXISTS");
    }

    private ensureDefaultOutletPayload(account: any, outlets: any[] = []) {
        if (outlets.some((outlet) => outlet.is_default || outlet.outlet_key === account.account_key)) {
            return outlets;
        }
        return [this.buildDefaultOutlet(account), ...outlets];
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

    private getAccountImageConfig(currentDocument: any, imageType: string) {
        const accountKey = String(currentDocument.account_key || currentDocument._id)
            .replace(/[^a-z0-9_-]/gi, "_")
            .toLowerCase();
        const trainerFolder =
            process.env.CLOUDINARY_TRAININER_SIGN ||
            process.env.CLOUDINARY_TRAINER_SIGN;
        const configs: Record<string, { field: string; folder: string; publicId: string }> = {
            logo: {
                field: "logo_url",
                folder: process.env.CLOUDINARY_LOGO_FOLDER || "e-suit/account-logo",
                publicId: `${accountKey}_logo`,
            },
            director: {
                field: "signature",
                folder:
                    process.env.CLOUDINARY_DIRECTOR_SIGN ||
                    process.env.CLOUDINARY_SIGNATURE_FOLDER ||
                    process.env.CLOUDINARY_LOGO_FOLDER ||
                    "e-suit/account-logo",
                publicId: `${accountKey}_director_signature`,
            },
            trainer: {
                field: "signature_trainer",
                folder:
                    trainerFolder ||
                    process.env.CLOUDINARY_SIGNATURE_FOLDER ||
                    process.env.CLOUDINARY_LOGO_FOLDER ||
                    "e-suit/account-logo",
                publicId: `${accountKey}_trainer_signature`,
            },
        };
        const config = configs[imageType];
        if (!config) {
            throw new Error("INVALID_ACCOUNT_IMAGE_TYPE");
        }

        return {
            ...config,
            fullPublicId: `${config.folder}/${config.publicId}`,
        };
    }

    private async uploadImageToCloudinary(
        imageBase64: string,
        mimeType: string,
        folder: string,
        publicId: string
    ) {
        if (!imageBase64) {
            throw new Error("ACCOUNT_IMAGE_REQUIRED");
        }

        if (!/^image\/(png|jpe?g|webp)$/i.test(mimeType)) {
            throw new Error("ACCOUNT_IMAGE_INVALID_TYPE");
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

    private async deleteImageFromCloudinary(publicId: string) {
        const { cloudName, apiKey, apiSecret } = this.getCloudinaryConfig();
        const timestamp = Math.floor(Date.now() / 1000).toString();
        const signaturePayload = `public_id=${publicId}&timestamp=${timestamp}`;
        const signature = crypto
            .createHash("sha1")
            .update(`${signaturePayload}${apiSecret}`)
            .digest("hex");
        const formData = new FormData();

        formData.append("public_id", publicId);
        formData.append("api_key", apiKey);
        formData.append("timestamp", timestamp);
        formData.append("signature", signature);

        const response = await fetch(
            `https://api.cloudinary.com/v1_1/${cloudName}/image/destroy`,
            {
                method: "POST",
                body: formData,
            }
        );
        const result: any = await response.json();

        if (!response.ok || !["ok", "not found"].includes(result?.result)) {
            throw new Error(result?.error?.message || "CLOUDINARY_DELETE_FAILED");
        }
    }

    private assertSuperAdmin(payload: any = {}) {
        const userRole = String(payload?.userRole || payload?.role || "").toLowerCase();
        if (userRole !== "superadmin") {
            throw new Error("SUPERADMIN_REQUIRED");
        }
    }

    private assertCanUpdateAccount(currentDocument: any, payload: any = {}, updateDto: any = {}) {
        const userRole = payload?.userRole?.toLowerCase();

        if (userRole === "head_office") {
            if (updateDto.account_name && updateDto.account_name !== currentDocument.account_name) {
                throw new Error("Head Office cannot modify account name");
            }

            const userClientNames = payload.clients?.map((c: any) => c.account_name.toLowerCase()) || [];
            if (!userClientNames.includes(currentDocument.account_key.toLowerCase())) {
                throw new Error("Not authorized to update this account");
            }

            const moduleAvailabilityFields = [
                "student_module",
                "master_course_module",
                "attendance_module",
                "employee_module",
                "employee_attendance_module",
                "employee_salary_report",
                "employee_salary_slip",
                "membership_module",
                "master_membership_type_module",
                "membership_attendance_module",
                "membership_payments_module",
            ];
            const changedAvailability = moduleAvailabilityFields.some((field) =>
                Object.prototype.hasOwnProperty.call(updateDto, field) &&
                Boolean(updateDto[field]) !== Boolean(currentDocument[field])
            );
            if (changedAvailability) {
                throw new Error("Head Office cannot change module availability");
            }
        }
    }

    private assertCanManageOutlets(currentDocument: any, payload: any = {}) {
        const userRole = String(payload?.userRole || "").toLowerCase();
        const allowedRoles = new Set([
            "superadmin",
            "account_managers",
            "agency_user",
            "head_office",
        ]);
        if (!allowedRoles.has(userRole)) {
            throw new Error("OUTLET_MANAGEMENT_NOT_ALLOWED");
        }
        this.assertCanUpdateAccount(currentDocument, payload);
    }

    private normalizeEmployeeModuleFields(account: any) {
        if (!account) return account;

        return stripEmailVerificationSecrets({
            ...account,
            custom_employee_fields: account.custom_employee_fields?.length
                ? account.custom_employee_fields
                : (account.custom_teacher_fields || []),
            employee_module: account.employee_module ?? account.teacher_module,
            employee_attendance_module: account.employee_attendance_module ?? account.teacher_attendance_module,
            employee_attendance_cutoff_day: account.employee_attendance_cutoff_day ?? account.teacher_attendance_cutoff_day,
            employee_salary_report: account.employee_salary_report ?? account.teacher_salary_report,
            employee_salary_slip: account.employee_salary_slip ?? account.teacher_salary_slip,
        });
    }

    private removeEmailVerificationInput(dto: any = {}) {
        delete dto.email_verified;
        delete dto.email_verified_at;
        delete dto.email_verification_token_hash;
        delete dto.email_verification_expires_at;
        delete dto.email_verification_sent_at;
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

    private normalizeIdSettings(dto: any = {}, fallback: any = {}) {
        const studentIdMode = ["auto", "manual"].includes(dto.student_id_mode)
            ? dto.student_id_mode
            : (fallback.student_id_mode || "auto");
        const studentIdPrefix = this.normalizeIdPrefix(
            dto.student_id_prefix ?? fallback.student_id_prefix,
            "STU"
        );
        const employeeIdMode = ["auto", "manual"].includes(dto.employee_id_mode)
            ? dto.employee_id_mode
            : (fallback.employee_id_mode || "auto");
        const employeeIdPrefix = this.normalizeIdPrefix(
            dto.employee_id_prefix ?? fallback.employee_id_prefix,
            "EMP"
        );

        return {
            ...dto,
            student_id_mode: studentIdMode,
            student_id_prefix: studentIdPrefix,
            student_id_total_length: this.normalizeIdTotalLength(
                dto.student_id_total_length ?? fallback.student_id_total_length,
                studentIdPrefix
            ),
            employee_id_mode: employeeIdMode,
            employee_id_prefix: employeeIdPrefix,
            employee_id_total_length: this.normalizeIdTotalLength(
                dto.employee_id_total_length ?? fallback.employee_id_total_length,
                employeeIdPrefix
            ),
        };
    }

    private normalizeOrganizationModules(dto: any = {}, fallbackOrgType = "educational") {
        const orgType = ["educational", "production", "service"].includes(dto.org_type)
            ? dto.org_type
            : fallbackOrgType;
        return {
            ...dto,
            org_type: orgType,
            ...(orgType !== "educational"
                ? {
                    student_module: false,
                    master_course_module: false,
                    attendance_module: false,
                    student_id_mode: "auto",
                }
                : {}),
        };
    }

    private applyAccountCreateDefaults(dto: any = {}) {
        const clientType = ["franchise", "outlet"].includes(dto.client_type)
            ? dto.client_type
            : "franchise";

        return this.normalizeIdSettings(this.normalizeOrganizationModules({
            ...dto,
            client_type: clientType,
        }));
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

    private async sendAccountVerificationEmail(account: any, token: string) {
        if (!account?.email || !token) return;

        await sendVerificationEmail({
            to: account.email,
            name: account.account_name || account.account_owner || "there",
            subject: "Verify your E-Tech Suite account email",
            verificationUrl: buildEmailVerificationUrl("accounts", token),
        });

        await Account.findByIdAndUpdate(account._id, {
            email_verification_sent_at: new Date(),
        });
    }

    async create(createDto: any) {
        assertAllowedEmail(createDto.email);
        this.removeEmailVerificationInput(createDto);
        delete createDto["_id"];
        createDto = this.applyAccountCreateDefaults(createDto);

        // Check for existing account_name
        const existingDealer = await Account.findOne({
            account_name: {
                $regex: new RegExp(`^${createDto.account_name}$`, "i"),
            },
        });
        if (existingDealer) {
            console.log("ACCOUNTS.DUPLICATE");

            throw new Error('ACCOUNTS.DUPLICATE');
        }

        if (createDto.account_code) {
            createDto.account_code = String(createDto.account_code).trim().toUpperCase();
            const existingAccountCode = await Account.findOne({
                account_code: {
                    $regex: new RegExp(`^${createDto.account_code}$`, "i"),
                },
            });
            if (existingAccountCode) {
                throw new Error('ACCOUNTS.DUPLICATE_ACCOUNT_CODE');
            }
        }

        // Check for existing slip_key
        if (createDto.slip_key) {
            const existingDomain = await Account.findOne({
                slip_key: { $regex: new RegExp(`^${createDto.slip_key}$`, "i") },
            });
            if (existingDomain) {
                throw new Error('ACCOUNTS.DUPLICATE_DOMAIN');
            }
        }

        // Check for existing account_key collision (generating unique key)
        const accountKeyBase = createDto.account_name.replace(/ /g, "_").toLowerCase();
        const existingAccKey = await Account.find({
            account_key: {
                $regex: new RegExp(`^${accountKeyBase}`, "i"),
            },
        });

        const emailVerification = this.createEmailVerificationUpdate(
            String(createDto.email || "").trim()
        );

        // Create new record
        const result = await Account.create({
            ...createDto,
            ...emailVerification.update,
            account_key: existingAccKey?.length
                ? `${accountKeyBase}_${existingAccKey?.length}`
                : accountKeyBase,
        });

        if (!result?._id) {
            throw new Error('Not Created');
        }

        if ((result.client_type || "franchise") === "franchise" && !result.outlets?.length) {
            result.outlets = [this.buildDefaultOutlet(result)];
            await result.save();
        }

        if (emailVerification.token) {
            try {
                await this.sendAccountVerificationEmail(result, emailVerification.token);
            } catch (error) {
                console.error("Account verification email failed:", error);
            }
        }

        return this.normalizeEmployeeModuleFields(result.toObject());
    }

    async findAll(query: any, payload: any) {
        // Robust query parsing
        const dropdown = String(query.dropdown).toLowerCase() == 'true';
        const search = query.search ? String(query.search).trim() : "";
        const pageNum = parseInt(query.pageNum as string) || 1;
        const count = parseInt(query.count as string) || 10;

        if (dropdown) {
            return await Account
                .find(
                    { status: { $ne: 0 } },
                    { account_name: 1, account_key: 1, account_code: 1, services: 1, _id: 1, status: 1 }
                )
                .collation({ locale: "en", strength: 2 })
                .sort({ account_name: 1 })
                .lean();
        }

        const filterQuery: any = {};

        const userRole = payload?.userRole?.toLowerCase();

        if (userRole === "account_managers") {
            // Account Managers can see accounts assigned to them OR unassigned accounts
            // Interpretation: account_owner matches username OR account_owner is empty/null
            filterQuery.$or = [
                { account_owner: payload.username },
                { account_owner: { $exists: false } },
                { account_owner: "" },
                { account_owner: null }
            ];
        } else if (userRole === "head_office" || userRole === "agency_user") {
            if (payload?.clients) {
                let accounts = payload.clients
                    .map((e: any) => e?.account_name?.toLowerCase())
                    .filter((name: any) => name !== undefined && name !== null);

                filterQuery.account_key = { $in: accounts };
            }
        } else if (userRole !== "superadmin" && payload?.clients) {
            let accounts = payload.clients
                .map((e: any) => e?.account_name?.toLowerCase())
                .filter((name: any) => name !== undefined && name !== null);

            filterQuery.account_key = { $in: accounts };
        }

        if (search) {
            filterQuery.$or = [{ account_name: { $regex: search, $options: "i" } }];
        }

        const accounts = await Account
            .find(filterQuery)
            .sort({ account_name: 1 })
            .collation({ locale: "en", strength: 2 })
            .skip((pageNum - 1) * count)
            .limit(count)
            .lean();

        if (accounts.length == 0) {
            throw new Error('ACCOUNTS.DOES_NOT_EXISTS');
        }

        const totalData = await Account
            .find(filterQuery, { account_name: 1, account_key: 1 })
            .sort({ account_name: 1 })
            .collation({ locale: "en", strength: 2 })
            .lean();

        const accountIds = accounts.map((account) => account.account_key);

        const orConditions = accountIds.flatMap((accountKey) => [
            { "clients.account_name": accountKey },
            { "clients.account_name": { $regex: `^${accountKey}$`, $options: "i" } },
        ]);

        const users: any = await User
            .find({
                $or: orConditions,
                deleted: { $ne: true },
                userType: ENUM_USER_TYPES.CLIENT,
            })
            .lean();

        const accountsWithUserCount = accounts.map((account) => {
            const userCount = users.filter((user: any) => {
                return user.clients.some(
                    (client: any) =>
                        client.account_name.toString().toLowerCase() ===
                        account.account_key.toString().toLowerCase()
                );
            }).length;

            return this.normalizeEmployeeModuleFields({
                ...account,
                status: account.status === 0,
                userCount,
            });
        });

        return {
            list: accountsWithUserCount,
            metaData: {
                pageNum,
                count,
                totalData: totalData?.length,
            },
        };
    }

    async findAllCount(payload: any) {
        const filterQuery: any = {};

        const userRole = payload?.userRole?.toLowerCase();

        if (userRole === "account_managers") {
            filterQuery.$or = [
                { account_owner: payload.username },
                { account_owner: { $exists: false } },
                { account_owner: "" },
                { account_owner: null }
            ];
        } else if (userRole === "head_office" || userRole === "agency_user") {
            if (payload?.clients) {
                let accounts = payload.clients
                    .map((e: any) => e?.account_name)
                    .filter((name: any) => name !== undefined && name !== null);
                filterQuery.account_key = { $in: accounts };
            }
        } else if (userRole !== "superadmin" && payload?.clients) {
            let accounts = payload.clients
                .map((e: any) => e?.account_name)
                .filter((name: any) => name !== undefined && name !== null);
            filterQuery.account_key = { $in: accounts };
        }

        const accountsCount = await Account.countDocuments(filterQuery);

        const requestCountAggregate = await Account.aggregate([
            { $unwind: "$services" },
            {
                $match: {
                    "services.req": { $in: [1, 2] },
                },
            },
            { $count: "totalRequests" },
        ]);

        const requestsCount = requestCountAggregate.length
            ? requestCountAggregate[0].totalRequests
            : 0;

        return { accountsCount, requestsCount };
    }

    async getById(id: string) {
        const result = await Account.findById(id).lean();
        if (!result) throw new Error('ACCOUNTS.NOT_FOUND');
        return this.normalizeEmployeeModuleFields(result);
    }

    async update(id: string, updateDto: any, payload: any = {}) {
        assertAllowedEmail(updateDto.email);
        this.removeEmailVerificationInput(updateDto);
        delete updateDto["_id"];

        const currentDocument = await Account.findById(id).lean();
        if (!currentDocument) throw new Error('ACCOUNTS.NOT_FOUND');
        updateDto = this.normalizeIdSettings(
            this.normalizeOrganizationModules(
                updateDto,
                currentDocument.org_type || "educational"
            ),
            currentDocument
        );

        this.assertCanUpdateAccount(currentDocument, payload, updateDto);

        if (
            updateDto.client_type === "franchise" &&
            currentDocument.client_type !== "franchise"
        ) {
            updateDto.outlets = this.ensureDefaultOutletPayload(
                currentDocument,
                Array.isArray(currentDocument.outlets) ? currentDocument.outlets : []
            );
        }

        if (updateDto.account_name) {
            const existingDealer = await Account.findOne({
                account_name: {
                    $regex: new RegExp(`^${updateDto.account_name}$`, "i"),
                },
                _id: { $ne: id },
            });
            if (existingDealer) {
                throw new Error('ACCOUNTS.DUPLICATE');
            }

            if (updateDto.slip_key) {
                const existingDomain = await Account.findOne({
                    slip_key: { $regex: new RegExp(`^${updateDto.slip_key}$`, "i") },
                    _id: { $ne: id },
                });
                if (existingDomain) {
                    throw new Error('ACCOUNTS.DUPLICATE_DOMAIN');
                }
            }
        }

        const incomingEmail =
            typeof updateDto.email === "string" ? updateDto.email.trim() : undefined;
        const emailChanged =
            incomingEmail !== undefined &&
            incomingEmail.toLowerCase() !== String(currentDocument.email || "").toLowerCase();
        const emailVerification = emailChanged
            ? this.createEmailVerificationUpdate(incomingEmail)
            : null;

        const result = await Account.findByIdAndUpdate(
            id,
            {
                ...updateDto,
                ...(emailVerification?.update || {}),
            },
            { new: true }
        ).lean();
        if (!result) throw new Error('ACCOUNTS.NOT_FOUND');

        if (emailVerification?.token) {
            try {
                await this.sendAccountVerificationEmail(result, emailVerification.token);
            } catch (error) {
                console.error("Account verification email failed:", error);
            }
        }

        if (updateDto.account_code !== undefined) {
            updateDto.account_code = String(updateDto.account_code || "").trim().toUpperCase();
            if (currentDocument.account_code && updateDto.account_code !== currentDocument.account_code) {
                throw new Error('ACCOUNTS.ACCOUNT_CODE_LOCKED');
            }
            if (updateDto.account_code) {
                const existingAccountCode = await Account.findOne({
                    account_code: {
                        $regex: new RegExp(`^${updateDto.account_code}$`, "i"),
                    },
                    _id: { $ne: id },
                });
                if (existingAccountCode) {
                    throw new Error('ACCOUNTS.DUPLICATE_ACCOUNT_CODE');
                }
            }
        }

        return this.normalizeEmployeeModuleFields(result);
    }

    async sendEmailVerification(id: string, payload: any = {}) {
        const account = await Account.findById(id).lean();
        if (!account) throw new Error('ACCOUNTS.NOT_FOUND');
        this.assertCanUpdateAccount(account, payload);
        if (!account.email) throw new Error("EMAIL_REQUIRED");

        const emailVerification = this.createEmailVerificationUpdate(account.email);
        const result = await Account.findByIdAndUpdate(
            id,
            emailVerification.update,
            { new: true }
        ).lean();
        if (!result) throw new Error('ACCOUNTS.NOT_FOUND');

        if (emailVerification.token) {
            await this.sendAccountVerificationEmail(result, emailVerification.token);
        }

        return this.normalizeEmployeeModuleFields(result);
    }

    async verifyEmail(token: string) {
        const tokenHash = hashEmailVerificationToken(String(token || ""));
        const result = await Account.findOneAndUpdate(
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
        return this.normalizeEmployeeModuleFields(result);
    }

    async getOutlets(accountName: string, payload: any = {}) {
        const account = await Account.findOne({
            $or: [
                { account_key: { $regex: new RegExp(`^${accountName}$`, "i") } },
                { account_name: { $regex: new RegExp(`^${accountName}$`, "i") } },
            ],
        }).lean();
        if (!account) throw new Error('ACCOUNTS.NOT_FOUND');

        if ((account.client_type || "franchise") !== "franchise") {
            return [];
        }

        const outlets = this.ensureDefaultOutletPayload(
            account,
            Array.isArray(account.outlets)
                ? account.outlets.filter((outlet: any) => outlet.deleted !== true)
                : []
        );
        if (outlets.length !== account.outlets?.length) {
            await Account.findByIdAndUpdate(account._id, { outlets });
        }
        const role = String(payload.userRole || "").toLowerCase();
        if (role === "head_office" || role === "superadmin") {
            return outlets;
        }

        const assigned = role === "user"
            ? (Array.isArray(payload.outlets) ? payload.outlets : [])
            : Array.isArray(payload.outlets) && payload.outlets.length
                ? payload.outlets
                : (payload.clients || []).map((client: any) => client.account_name);
        const allowed = new Set(
            assigned.map((key: any) => String(key).toLowerCase())
        );
        return outlets.filter((outlet: any) =>
            allowed.has(String(outlet.outlet_key).toLowerCase())
        );
    }

    async createOutlet(accountId: string, outletDto: any, payload: any = {}) {
        assertAllowedEmail(outletDto.email);
        const account = await Account.findById(accountId).lean();
        if (!account) throw new Error('ACCOUNTS.NOT_FOUND');
        this.assertCanManageOutlets(account, payload);
        if ((account.client_type || "franchise") !== "franchise") {
            throw new Error("OUTLETS_REQUIRE_FRANCHISE");
        }

        const outletName = String(outletDto.outlet_name || "").trim();
        if (!outletName) throw new Error("OUTLET_NAME_REQUIRED");
        const slipKey = this.normalizeSlipKey(outletDto.slip_key);
        this.assertOutletSlipKeyAvailable(slipKey, account);
        const outletKey = `${account.account_key}__${this.slugifyOutletName(outletName)}`;
        const duplicate = (account.outlets || []).some(
            (outlet: any) =>
                outlet.deleted !== true &&
                outlet.outlet_key?.toLowerCase() === outletKey.toLowerCase() ||
                (outlet.deleted !== true && outlet.outlet_name?.toLowerCase() === outletName.toLowerCase())
        );
        if (duplicate) throw new Error("OUTLET_DUPLICATE");

        const outlet = {
            ...outletDto,
            outlet_name: outletName,
            outlet_key: outletKey,
            slip_key: slipKey,
            status: outletDto.status === 0 ? 0 : 1,
            is_default: false,
        };
        const result = await Account.findByIdAndUpdate(
            accountId,
            { $push: { outlets: outlet } },
            { new: true }
        ).lean();
        if (!result) throw new Error('ACCOUNTS.NOT_FOUND');
        return (result.outlets || []).filter((item: any) => item.deleted !== true);
    }

    async updateOutlet(accountId: string, outletId: string, outletDto: any, payload: any = {}) {
        assertAllowedEmail(outletDto.email);
        const account = await Account.findById(accountId).lean();
        if (!account) throw new Error('ACCOUNTS.NOT_FOUND');
        this.assertCanManageOutlets(account, payload);

        const outlet: any = (account.outlets || []).find(
            (item: any) => String(item._id) === outletId && item.deleted !== true
        );
        if (!outlet) throw new Error("OUTLET_NOT_FOUND");

        const setFields: Record<string, unknown> = {};
        if (outletDto.slip_key !== undefined) {
            const slipKey = this.normalizeSlipKey(outletDto.slip_key);
            this.assertOutletSlipKeyAvailable(slipKey, account, outletId);
            setFields["outlets.$.slip_key"] = slipKey;
        }
        [
            "outlet_name",
            "location",
            "company_address",
            "country",
            "state",
            "city",
            "postal_code",
            "contact_number",
            "email",
            "status",
        ].forEach((field) => {
            if (
                (outlet.is_default || outlet.outlet_key === account.account_key) &&
                (field === "outlet_name" || field === "status")
            ) {
                return;
            }
            if (outletDto[field] !== undefined) {
                setFields[`outlets.$.${field}`] = outletDto[field];
            }
        });

        const result = await Account.findOneAndUpdate(
            { _id: accountId, "outlets._id": outletId },
            { $set: setFields },
            { new: true }
        ).lean();
        if (!result) throw new Error("OUTLET_NOT_FOUND");
        return (result.outlets || []).filter((item: any) => item.deleted !== true);
    }

    async deleteOutlet(accountId: string, outletId: string, payload: any = {}) {
        const account = await Account.findById(accountId).lean();
        if (!account) throw new Error('ACCOUNTS.NOT_FOUND');
        this.assertCanManageOutlets(account, payload);

        const outlet: any = (account.outlets || []).find(
            (item: any) => String(item._id) === outletId && item.deleted !== true
        );
        if (!outlet) throw new Error("OUTLET_NOT_FOUND");
        if (outlet.is_default || outlet.outlet_key === account.account_key) {
            throw new Error("DEFAULT_OUTLET_DELETE_NOT_ALLOWED");
        }

        const deleteUpdate = getSoftDeleteUpdate(payload);
        const result = await Account.findOneAndUpdate(
            { _id: accountId, "outlets._id": outletId },
            {
                $set: {
                    "outlets.$.deleted": true,
                    "outlets.$.deleted_at": deleteUpdate.deleted_at,
                    "outlets.$.deleted_by": deleteUpdate.deleted_by,
                },
            },
            { new: true }
        ).lean();
        if (!result) throw new Error('ACCOUNTS.NOT_FOUND');
        return (result.outlets || []).filter((item: any) => item.deleted !== true);
    }

    async uploadLogo(id: string, uploadDto: any, payload: any = {}) {
        const currentDocument = await Account.findById(id).lean();
        if (!currentDocument) throw new Error('ACCOUNTS.NOT_FOUND');

        this.assertCanUpdateAccount(currentDocument, payload);

        const imageBase64 = String(uploadDto?.imageBase64 || "");
        const mimeType = String(uploadDto?.mimeType || "image/jpeg");
        const imageConfig = this.getAccountImageConfig(currentDocument, "logo");
        if ((currentDocument as any)[imageConfig.field]) {
            throw new Error("ACCOUNT_IMAGE_ALREADY_EXISTS");
        }
        const logoUrl = await this.uploadImageToCloudinary(
            imageBase64,
            mimeType,
            imageConfig.folder,
            imageConfig.publicId
        );

        const result = await Account.findByIdAndUpdate(
            id,
            { [imageConfig.field]: logoUrl },
            { new: true }
        ).lean();
        if (!result) throw new Error('ACCOUNTS.NOT_FOUND');

        return this.normalizeEmployeeModuleFields(result);
    }

    async uploadSignature(id: string, signatureType: string, uploadDto: any, payload: any = {}) {
        const currentDocument = await Account.findById(id).lean();
        if (!currentDocument) throw new Error('ACCOUNTS.NOT_FOUND');

        this.assertCanUpdateAccount(currentDocument, payload);

        if ((currentDocument.org_type || "educational") !== "educational") {
            throw new Error("SIGNATURE_UPLOAD_REQUIRES_EDUCATIONAL_ORG");
        }
        if (currentDocument.certificate_needed === false) {
            throw new Error("CERTIFICATE_NOT_ENABLED");
        }

        const signatureFields: Record<string, "signature" | "signature_trainer"> = {
            director: "signature",
            trainer: "signature_trainer",
        };
        const signatureField = signatureFields[signatureType];
        if (!signatureField) {
            throw new Error("INVALID_SIGNATURE_TYPE");
        }
        if (currentDocument[signatureField]) {
            throw new Error("ACCOUNT_IMAGE_ALREADY_EXISTS");
        }

        const imageConfig = this.getAccountImageConfig(currentDocument, signatureType);
        const signatureUrl = await this.uploadImageToCloudinary(
            String(uploadDto?.imageBase64 || ""),
            String(uploadDto?.mimeType || "image/jpeg"),
            imageConfig.folder,
            imageConfig.publicId
        );

        const result = await Account.findByIdAndUpdate(
            id,
            { [signatureField]: signatureUrl },
            { new: true }
        ).lean();
        if (!result) throw new Error('ACCOUNTS.NOT_FOUND');

        return this.normalizeEmployeeModuleFields(result);
    }

    async deleteAccountImage(id: string, imageType: string, payload: any = {}) {
        this.assertSuperAdmin(payload);

        const currentDocument = await Account.findById(id).lean();
        if (!currentDocument) throw new Error('ACCOUNTS.NOT_FOUND');

        const imageConfig = this.getAccountImageConfig(currentDocument, imageType);
        if (!(currentDocument as any)[imageConfig.field]) {
            throw new Error("ACCOUNT_IMAGE_NOT_FOUND");
        }

        await this.deleteImageFromCloudinary(imageConfig.fullPublicId);

        const result = await Account.findByIdAndUpdate(
            id,
            { [imageConfig.field]: "" },
            { new: true }
        ).lean();
        if (!result) throw new Error('ACCOUNTS.NOT_FOUND');

        return this.normalizeEmployeeModuleFields(result);
    }

    async updateServices(id: string, services: any) {
        const currentDocument = await Account.findById(id).lean();
        if (!currentDocument) throw new Error('ACCOUNTS.NOT_FOUND');

        const result = await Account.findByIdAndUpdate(id, { services }, { new: true }).lean();
        if (!result) throw new Error('ACCOUNTS.NOT_FOUND');

        return this.normalizeEmployeeModuleFields(result);
    }

    async changeStatus(id: string, payload: any = {}) {
        if (payload?.userRole?.toLowerCase() === "head_office") {
            throw new Error("Head Office cannot delete or change account status");
        }
        const foundDealer = await Account.findById(id).lean();
        if (!foundDealer) throw new Error('ACCOUNTS.NOT_FOUND');

        return await Account.findByIdAndUpdate(
            id,
            { status: foundDealer.status ? 0 : 1 },
            { new: true }
        ).lean();
    }

    async getServicesWithReq(query: any) {
        const search = query.search as string || "";
        const pageNum = parseInt(query.pageNum as string) || 1;
        const count = parseInt(query.count as string) || 10;

        const searchFilter = search
            ? {
                $or: [
                    { "services.label": { $regex: search, $options: "i" } },
                    { "services.value": { $regex: search, $options: "i" } },
                ],
            }
            : {};

        const result = await Account.aggregate([
            { $unwind: "$services" },
            {
                $match: {
                    "services.req": { $in: [1, 2] },
                    ...searchFilter,
                },
            },
            {
                $project: {
                    _id: 0,
                    account_name: 1,
                    requested_by: "$services.email",
                    req: "$services.req",
                    username: "$services.username",
                    date: "$services.updatedAt",
                    service: "$services.label",
                },
            },
            { $skip: Number((pageNum - 1) * count) },
            { $limit: Number(count) },
        ]);

        const totalData = await Account.aggregate([
            { $unwind: "$services" },
            {
                $match: {
                    "services.req": { $in: [1, 2] },
                    ...searchFilter,
                },
            },
            { $count: "total" },
        ]);

        return {
            list: result,
            metaData: {
                pageNum,
                count,
                totalData: totalData.length ? totalData[0].total : 0,
            },
        };
    }

    async updateRequestStatus(data: any) {
        const { account_name, req: reqType, service, reject, reason } = data;

        let updateFields: any = {
            "services.$.req": 0,
            "services.$.updatedAt": new Date(),
            "services.$.reason": "",
        };

        if (reject) {
            updateFields["services.$.reason"] = reason;
        } else {
            if (reqType === 1) {
                updateFields["services.$.active"] = true;
            } else if (reqType === 0) {
                updateFields["services.$.active"] = false;
            } else {
                throw new Error("Invalid request type");
            }
        }

        const result = await Account.findOneAndUpdate(
            {
                account_name: { $regex: new RegExp(`^${account_name}$`, "i") },
                "services.value": service,
            },
            {
                $set: updateFields,
            },
            { new: true }
        );

        if (!result) {
            throw new Error("Service not found");
        }

        return result;
    }

    async getAccountByAccountName(account_name: string) {
        const result = await Account
            .findOne({
                $or: [
                    { account_key: { $regex: new RegExp(`^${account_name}$`, "i") } },
                    { "outlets.outlet_key": { $regex: new RegExp(`^${account_name}$`, "i") } },
                ],
            })
            .lean();

        if (!result) throw new Error('ACCOUNTS.NOT_FOUND');
        return this.normalizeEmployeeModuleFields(result);
    }
}
