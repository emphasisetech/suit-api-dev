import Employee, { IEmployee } from "./model/Employee";
import Account from "../Account/model/Account";
import { assertAllowedEmail } from "../../utils/emailValidation";
import EmployeeAttendance from "./model/EmployeeAttendance";
import { activeRecordFilter, getSoftDeleteUpdate } from "../../utils/softDelete";
import crypto from "crypto";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { sendOtpEmail } from "../../utils/resendMailer";
import Student from "../Student/model/Student";
import TeacherClassAttendance from "./model/TeacherClassAttendance";
import TeacherAssignment from "./model/TeacherAssignment";
import PortalChatMessage from "./model/PortalChatMessage";
import Parent from "../Parent/model/Parent";
import { StudentService } from "../Student/studentService";

const studentService = new StudentService();

type AttendanceStatus = 'Present' | 'Absent' | 'Half Day' | 'Paid Leave' | 'Unpaid Leave';
type HolidayRule = 'previous' | 'next' | 'both' | 'either' | 'always';

const DEFAULT_POLICY = {
    salaryBasisType: "calendar_days",
    calcDays: 30,
    weeklyHolidays: [0],
    holidayEligibility: "always" as HolidayRule,
    consecutiveHolidayEligibility: "always" as HolidayRule,
    holidayWorkPolicy: "normal_pay",
    holidayWorkMultiplier: 1,
    compOffExtraMultiplier: 0.5,
    standardWorkingHours: 8,
    fullDayHours: 8,
    halfDayHours: 4,
    overtimeStartAfterHours: 8,
    overtimeMethod: "hourly",
    overtimeMultiplier: 1.5,
    halfDayRatio: 0.5,
};

const roundMoney = (value: number) => Math.round(value * 100) / 100;
const toDateKey = (date: Date) => date.toISOString().slice(0, 10);
const toLocalDateKey = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
};
const monthEndDateKey = (month: number, year: number) => toDateKey(new Date(Date.UTC(year, month, 0)));
const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const hashSecret = (value: string) => crypto.createHash("sha256").update(value).digest("hex");
const maskEmail = (email: string) => {
    const [name, domain] = String(email || "").split("@");
    if (!name || !domain) return "";
    return `${name.slice(0, 2)}${"*".repeat(Math.max(name.length - 2, 2))}@${domain}`;
};

class EmployeeService {
    async createEmployee(data: any, user: any = {}) {
        assertAllowedEmail(data.email);
        await this.validateSchoolStaffType(data.client, data.staff_type, data.non_teaching_category, data);
        await this.prepareStaffCredentials(data, data.client, true);
        const idSettings = await this.getEmployeeIdSettings(data.client);
        if (idSettings.mode === "auto") {
            data.employee_id = await this.generateEmployeeId(data.client, idSettings);
        } else {
            data.employee_id = this.normalizeEmployeeId(data.employee_id);
            if (data.employee_id && !this.canManageEmployeeId(user)) {
                throw new Error("Only head office users can add employee ID");
            }
            await this.assertUniqueEmployeeId(data.client, data.employee_id);
        }

        const salary = Number(data.salary) || 0;
        const effectiveDate = this.normalizeDateKey(
            data.salary_effective_date || data.joining_date || toDateKey(new Date())
        );
        data.salary = salary;
        data.salary_history = this.normalizeSalaryHistory(data.salary_history, salary, effectiveDate);
        const employee = new Employee(data);
        await employee.save();

        // Sync custom field labels to Account
        if (data.custom_fields && data.custom_fields.length > 0) {
            await this.syncCustomFieldLabels(data.client, data.custom_fields);
        }

        const result: any = employee.toObject();
        delete result.password;
        return result;
    }

    async updateEmployee(id: string, data: any, user: any = {}) {
        assertAllowedEmail(data.email);
        const existingEmployee = await Employee.findOne({ _id: id, ...activeRecordFilter });
        if (!existingEmployee) throw new Error("Employee not found");

        const client = data.client || existingEmployee.client;
        await this.validateSchoolStaffType(client, data.staff_type ?? (existingEmployee as any).staff_type, data.non_teaching_category ?? (existingEmployee as any).non_teaching_category, data);
        await this.prepareStaffCredentials(data, client, false, id);
        const idSettings = await this.getEmployeeIdSettings(client);
        const existingEmployeeId = this.normalizeEmployeeId((existingEmployee as any).employee_id);
        if (idSettings.mode === "auto") {
            data.employee_id = existingEmployeeId || await this.generateEmployeeId(client, idSettings);
        } else {
            const submittedEmployeeId = this.normalizeEmployeeId(data.employee_id);
            if (submittedEmployeeId !== existingEmployeeId && !this.canManageEmployeeId(user)) {
                throw new Error("Only head office users can update employee ID");
            }
            data.employee_id = submittedEmployeeId;
            await this.assertUniqueEmployeeId(client, submittedEmployeeId, id);
        }

        const nextSalary = Number(data.salary ?? existingEmployee.salary) || 0;
        const salaryChanged = Number(existingEmployee.salary || 0) !== nextSalary;
        const salaryEffectiveDate = this.normalizeDateKey(
            data.salary_effective_date || toDateKey(new Date())
        );
        const salaryHistory = this.normalizeSalaryHistory(
            (existingEmployee as any).salary_history,
            Number(existingEmployee.salary || 0),
            this.normalizeDateKey(existingEmployee.joining_date || existingEmployee.createdAt || toDateKey(new Date()))
        );

        if (salaryChanged) {
            const existingIndex = salaryHistory.findIndex((item) => item.effective_date === salaryEffectiveDate);
            if (existingIndex >= 0) {
                salaryHistory[existingIndex].amount = nextSalary;
            } else {
                salaryHistory.push({ amount: nextSalary, effective_date: salaryEffectiveDate });
            }
        } else if (data.salary_effective_date) {
            // Allow correcting the effective date without forcing a salary amount change.
            let currentSalaryIndex = -1;
            for (let index = salaryHistory.length - 1; index >= 0; index -= 1) {
                if (Number(salaryHistory[index].amount) === nextSalary) {
                    currentSalaryIndex = index;
                    break;
                }
            }

            const sameDateIndex = salaryHistory.findIndex(
                (item) => item.effective_date === salaryEffectiveDate,
            );

            if (currentSalaryIndex >= 0 && currentSalaryIndex !== sameDateIndex) {
                if (sameDateIndex >= 0) {
                    salaryHistory[sameDateIndex].amount = nextSalary;
                    salaryHistory.splice(currentSalaryIndex, 1);
                } else {
                    salaryHistory[currentSalaryIndex].effective_date = salaryEffectiveDate;
                }
            } else if (currentSalaryIndex < 0) {
                salaryHistory.push({ amount: nextSalary, effective_date: salaryEffectiveDate });
            }
        }

        data.salary = nextSalary;
        data.salary_history = salaryHistory.sort((a, b) => a.effective_date.localeCompare(b.effective_date));

        const employee = await Employee.findOneAndUpdate(
            { _id: id, ...activeRecordFilter },
            data,
            { new: true, runValidators: true }
        );
        if (!employee) throw new Error("Employee not found");

        // Sync custom field labels to Account
        if (data.custom_fields && data.custom_fields.length > 0) {
            await this.syncCustomFieldLabels(employee.client, data.custom_fields);
        }

        return employee;
    }

    async getEmployees(query: any) {
        const { client, search, ...filters } = query;
        if (!client) throw new Error("Client required");

        const mongoQuery: any = { client, ...filters, ...activeRecordFilter };
        if (search) {
            mongoQuery.$or = [
                { name: { $regex: search, $options: "i" } },
                { email: { $regex: search, $options: "i" } },
                { phone: { $regex: search, $options: "i" } }
            ];
        }

        // Fetch account to get master list of custom fields
        const account = await Account.findOne({
            $or: [
                { account_name: client },
                { account_key: client },
                { "outlets.outlet_key": client },
            ],
        }).lean();
        const masterCustomFields: string[] = account?.custom_employee_fields?.length
            ? account.custom_employee_fields
            : ((account as any)?.custom_teacher_fields || []);

        const employees = await Employee.find(mongoQuery).lean();

        // Merge master custom fields into each employee for UI consistency
        const processedEmployees = employees.map(employee => {
            const mergedFields = masterCustomFields.map(label => {
                const existingField = employee.custom_fields.find(f => f.label === label);
                return { label, value: existingField ? existingField.value : "" };
            });
            return { ...employee, custom_fields: mergedFields };
        });

        return processedEmployees;
    }

    async deleteEmployee(id: string, payload: any = {}) {
        return await Employee.findOneAndUpdate(
            { _id: id, ...activeRecordFilter },
            { $set: getSoftDeleteUpdate(payload) },
            { new: true }
        );
    }

    async markAttendance(data: { employeeId: string, date: string, client: string, status: string, workHours?: number, reason?: string, checkIn?: string, checkOut?: string, otHours?: number }) {
        const attendanceData = {
            ...data,
            teacherId: data.employeeId,
        };

        return await EmployeeAttendance.findOneAndUpdate(
            {
                date: data.date,
                $or: [
                    { employeeId: data.employeeId },
                    { teacherId: data.employeeId }
                ]
            },
            attendanceData,
            { upsert: true, new: true }
        );
    }

    async markBulkAttendance(records: { employeeId: string, date: string, client: string, status: string, workHours?: number, reason?: string, checkIn?: string, checkOut?: string, otHours?: number }[]) {
        if (!Array.isArray(records) || records.length === 0) return [];

        const operations: any[] = records
            .filter((record) => record.employeeId && record.date)
            .map((record) => ({
                updateOne: {
                    filter: {
                        date: record.date,
                        $or: [
                            { employeeId: record.employeeId },
                            { teacherId: record.employeeId }
                        ]
                    },
                    update: {
                        $set: {
                            ...record,
                            teacherId: record.employeeId,
                        }
                    },
                    upsert: true
                }
            }));

        return await EmployeeAttendance.bulkWrite(operations);
    }

    async removeAttendanceCheckout(employeeId: string, date: string, client: string) {
        if (!employeeId || !date || !client) {
            throw new Error("Employee, date and client are required");
        }

        const attendance = await EmployeeAttendance.findOneAndUpdate(
            {
                date,
                client,
                $or: [{ employeeId }, { teacherId: employeeId }],
                checkOut: { $nin: [null, ""] },
            },
            { $set: { checkOut: "", workHours: 0 } },
            { new: true },
        );
        if (!attendance) throw new Error("Completed employee checkout not found");
        return attendance;
    }

    async getEmployeeAttendance(client: string, date: string) {
        const attendance = await EmployeeAttendance.find({ client, date }).lean();
        return attendance.map((record: any) => ({
            ...record,
            employeeId: record.employeeId || record.teacherId
        }));
    }

    async getSalaryReport(client: string, month: string, year: string) {
        const account = await Account.findOne({
            $or: [
                { account_name: client },
                { account_key: client },
                { "outlets.outlet_key": client },
            ],
        }).lean();
        const policy = this.getPayrollPolicy(account);
        const fixedAllowance = Number(account?.payroll_fixed_allowance) || 0;
        const fixedDeduction = Number(account?.payroll_fixed_deduction) || 0;
        const pfPercent = Number(account?.payroll_pf_percent) || 0;
        const esiPercent = Number(account?.payroll_esi_percent) || 0;
        const professionalTax = Number(account?.payroll_professional_tax) || 0;

        const employees = await Employee.find({ client, status: 1, ...activeRecordFilter }).lean();
        const monthNumber = Number(month);
        const yearNumber = Number(year);
        const daysInMonth = new Date(yearNumber, monthNumber, 0).getDate();
        const dates = Array.from({ length: daysInMonth }, (_, index) => {
            const date = new Date(Date.UTC(yearNumber, monthNumber - 1, index + 1));
            return {
                key: toDateKey(date),
                day: date.getUTCDay(),
            };
        });
        const previousMonthEdge = new Date(Date.UTC(yearNumber, monthNumber - 1, 0));
        const nextMonthEdge = new Date(Date.UTC(yearNumber, monthNumber, 1));
        const attendanceDateKeys = [
            toDateKey(previousMonthEdge),
            ...dates.map((date) => date.key),
            toDateKey(nextMonthEdge),
        ];
        const totalWorkingDays = dates.filter((date) => !policy.weeklyHolidays.includes(date.day)).length;
        const salaryDivisor = policy.salaryBasisType === "calendar_days"
            ? policy.calcDays || daysInMonth
            : policy.calcDays || totalWorkingDays || daysInMonth;
        const todayKey = toLocalDateKey(new Date());

        const report = await Promise.all(employees.map(async (employee) => {
            const joiningDateKey = employee.joining_date ? this.normalizeDateKey(employee.joining_date) : "";
            const attendance = await EmployeeAttendance.find({
                $or: [
                    { employeeId: employee._id },
                    { teacherId: employee._id }
                ],
                date: { $in: attendanceDateKeys }
            }).lean();
            const attendanceByDate = new Map(attendance.map((item: any) => [item.date, item]));
            const holidayChains = this.getHolidayChains(dates, policy.weeklyHolidays);

            const effectiveSalary = this.getEffectiveSalary(employee, monthNumber, yearNumber);
            const baseSalary = effectiveSalary.amount;
            const dailyRate = salaryDivisor ? baseSalary / salaryDivisor : 0;
            const hourlyRate = policy.standardWorkingHours ? dailyRate / policy.standardWorkingHours : 0;
            const totals = {
                presentDays: 0,
                halfDays: 0,
                paidLeaves: 0,
                unpaidLeaves: 0,
                absentDays: 0,
                paidHolidays: 0,
                unpaidHolidays: 0,
                holidayWorkedDays: 0,
                holidayPayUnits: 0,
                overtimeHours: 0,
                compOffDays: 0,
                payableDays: 0,
            };
            const dailyAttendance: any[] = [];

            for (const date of dates) {
                const record = attendanceByDate.get(date.key) as any;
                const isHoliday = policy.weeklyHolidays.includes(date.day);
                const isFutureUnmarkedDate = date.key > todayKey && !record;
                const isBeforeJoiningDate = joiningDateKey ? date.key < joiningDateKey : false;
                const status = isFutureUnmarkedDate
                    ? ""
                    : this.getQualifiedStatus(record?.status, Number(record?.workHours) || 0, policy);
                const dailyRecord: any = {
                    date: date.key,
                    day: date.day,
                    isHoliday,
                    status,
                    savedStatus: record?.status || "",
                    workHours: Number(record?.workHours) || 0,
                    reason: record?.reason || "",
                    payableDay: 0,
                    overtimeHours: 0,
                    holidayPayUnit: 0,
                    compOffDay: 0,
                };

                if (isFutureUnmarkedDate || isBeforeJoiningDate) {
                    dailyRecord.status = "";
                    dailyRecord.savedStatus = "";
                    dailyRecord.workHours = 0;
                    dailyRecord.reason = "";
                    dailyAttendance.push(dailyRecord);
                    continue;
                }

                if (isHoliday) {
                    if (status && this.isWorkedStatus(status)) {
                        const workHours = Number(record?.workHours) || policy.standardWorkingHours;
                        dailyRecord.workHours = workHours;
                        dailyRecord.payableDay = status === "Half Day" ? policy.halfDayRatio : 1;
                        dailyRecord.holidayPayUnit = this.getHolidayWorkedPayUnits(policy);
                        dailyRecord.compOffDay = this.getHolidayCompOffDays(policy);
                        dailyRecord.overtimeHours = this.getOvertimeHours(workHours, policy);
                        totals.holidayWorkedDays += status === "Half Day" ? policy.halfDayRatio : 1;
                        totals.holidayPayUnits += this.getHolidayWorkedPayUnits(policy);
                        totals.compOffDays += this.getHolidayCompOffDays(policy);
                        totals.overtimeHours += this.getOvertimeHours(workHours, policy);
                    } else if (this.isHolidayPaid(date.key, holidayChains, attendanceByDate, policy)) {
                        dailyRecord.status = "Paid Holiday";
                        dailyRecord.payableDay = 1;
                        totals.paidHolidays += 1;
                        totals.payableDays += 1;
                    } else {
                        dailyRecord.status = "Unpaid Holiday";
                        totals.unpaidHolidays += 1;
                    }
                    dailyAttendance.push(dailyRecord);
                    continue;
                }

                if (status === "Present") {
                    dailyRecord.payableDay = 1;
                    totals.presentDays += 1;
                    totals.payableDays += 1;
                } else if (status === "Half Day") {
                    dailyRecord.payableDay = policy.halfDayRatio;
                    totals.halfDays += 1;
                    totals.payableDays += policy.halfDayRatio;
                } else if (status === "Paid Leave") {
                    dailyRecord.payableDay = 1;
                    totals.paidLeaves += 1;
                    totals.payableDays += 1;
                } else if (status === "Unpaid Leave") {
                    totals.unpaidLeaves += 1;
                } else {
                    totals.absentDays += 1;
                }

                if (status && this.isWorkedStatus(status)) {
                    dailyRecord.overtimeHours = this.getOvertimeHours(Number(record?.workHours) || 0, policy);
                    totals.overtimeHours += dailyRecord.overtimeHours;
                }
                dailyAttendance.push(dailyRecord);
            }

            const earnedSalary = dailyRate * totals.payableDays;
            const holidayPayAmount = dailyRate * totals.holidayPayUnits;
            const overtimeAmount = this.getOvertimeAmount(totals.overtimeHours, dailyRate, hourlyRate, policy);
            const grossSalary = earnedSalary + holidayPayAmount + overtimeAmount + fixedAllowance;
            const pfDeduction = (grossSalary * pfPercent) / 100;
            const esiDeduction = (grossSalary * esiPercent) / 100;
            const totalDeductions = fixedDeduction + professionalTax + pfDeduction + esiDeduction;
            const netSalary = Math.max(grossSalary - totalDeductions, 0);

            return {
                employeeId: employee._id,
                name: employee.name,
                joiningDate: joiningDateKey,
                baseSalary,
                currentSalary: Number(employee.salary) || 0,
                salaryEffectiveDate: effectiveSalary.effectiveDate,
                totalCalendarDays: daysInMonth,
                totalWorkingDays,
                presentDays: totals.presentDays,
                halfDays: totals.halfDays,
                paidLeaves: totals.paidLeaves,
                unpaidLeaves: totals.unpaidLeaves,
                absentDays: totals.absentDays,
                paidHolidays: totals.paidHolidays,
                unpaidHolidays: totals.unpaidHolidays,
                holidayWorkedDays: totals.holidayWorkedDays,
                overtimeHours: roundMoney(totals.overtimeHours),
                compOffDays: roundMoney(totals.compOffDays),
                payableDays: roundMoney(totals.payableDays + totals.holidayPayUnits),
                earnedSalary: roundMoney(earnedSalary),
                overtimeAmount: roundMoney(overtimeAmount),
                holidayPayAmount: roundMoney(holidayPayAmount),
                fixedAllowance: roundMoney(fixedAllowance),
                grossSalary: roundMoney(grossSalary),
                pfDeduction: roundMoney(pfDeduction),
                esiDeduction: roundMoney(esiDeduction),
                professionalTax: roundMoney(professionalTax),
                fixedDeduction: roundMoney(fixedDeduction),
                totalDeductions: roundMoney(totalDeductions),
                calculatedSalary: roundMoney(netSalary),
                dailyAttendance,
                payrollSettings: {
                    calcDays: salaryDivisor,
                    salaryBasisType: policy.salaryBasisType,
                    weeklyHolidays: policy.weeklyHolidays,
                    standardWorkingHours: policy.standardWorkingHours,
                    overtimeMultiplier: policy.overtimeMultiplier,
                    pfPercent,
                    esiPercent,
                    halfDayRatio: policy.halfDayRatio
                }
            };
        }));

        return report;
    }

    async requestPortalOtp(accountCode: string, employeeKey: string, staffPortal = false) {
        const employee = await this.findEmployeeByAccountCodeAndKey(accountCode, employeeKey, {}, staffPortal);
        if (!employee) throw new Error("EMPLOYEE.NOT_FOUND");
        if (!employee.email) throw new Error("EMAIL_REQUIRED");

        const otp = String(crypto.randomInt(100000, 1000000));
        const otpTtlMinutes = Number(process.env.EMPLOYEE_PORTAL_OTP_TTL_MINUTES || 10);
        await Employee.findByIdAndUpdate(employee._id, {
            portal_otp_hash: hashSecret(otp),
            portal_otp_expires_at: new Date(Date.now() + otpTtlMinutes * 60 * 1000),
            portal_otp_sent_at: new Date(),
            portal_access_token_hash: "",
            portal_access_token_expires_at: null,
        });

        await sendOtpEmail({
            to: employee.email,
            name: employee.name,
            otp,
            subject: `Your E-Tech Suite ${staffPortal ? "staff" : "employee"} portal OTP`,
            purpose: "securely access your dashboard, attendance and salary slips",
            expiresInMinutes: otpTtlMinutes,
        });

        return {
            employee_id: this.getEmployeePublicId(employee),
            email: maskEmail(employee.email),
            expires_in_minutes: otpTtlMinutes,
        };
    }

    async verifyPortalOtp(accountCode: string, employeeKey: string, otp: string, staffPortal = false) {
        const employee = await this.findEmployeeByAccountCodeAndKey(accountCode, employeeKey, {
            portal_otp_hash: hashSecret(String(otp || "")),
            portal_otp_expires_at: { $gt: new Date() },
        }, staffPortal);
        if (!employee) throw new Error("EMPLOYEE_PORTAL_OTP_INVALID_OR_EXPIRED");

        const accessToken = crypto.randomBytes(32).toString("hex");
        const accessTtlHours = Number(process.env.EMPLOYEE_PORTAL_ACCESS_TTL_HOURS || 12);
        await Employee.findByIdAndUpdate(employee._id, {
            portal_otp_hash: "",
            portal_otp_expires_at: null,
            portal_access_token_hash: hashSecret(accessToken),
            portal_access_token_expires_at: new Date(Date.now() + accessTtlHours * 60 * 60 * 1000),
        });

        return {
            access_token: accessToken,
            expires_in_hours: accessTtlHours,
            employee: this.getPortalEmployee(employee),
        };
    }

    async getPortalData(accountCode: string, employeeKey: string, accessToken: string, month: string, year: string, staffPortal = false) {
        const employee = await this.findEmployeeByAccountCodeAndKey(accountCode, employeeKey, {
            portal_access_token_hash: hashSecret(String(accessToken || "")),
            portal_access_token_expires_at: { $gt: new Date() },
        }, staffPortal);
        if (!employee) throw new Error("EMPLOYEE_PORTAL_ACCESS_INVALID_OR_EXPIRED");

        const report = await this.getSalaryReport(employee.client, month, year);
        const salarySlip = report.find((row: any) => String(row.employeeId) === String(employee._id)) || null;
        return {
            employee: this.getPortalEmployee(employee),
            salarySlip,
        };
    }

    async loginStaffPortal(accountCode: string, username: string, password: string) {
        const account: any = await Account.findOne({
            account_code: { $regex: new RegExp(`^${escapeRegex(String(accountCode || "").trim())}$`, "i") },
            org_subtype: "school",
            status: { $ne: 0 },
        }).lean();
        if (!account) throw new Error("School account not found");

        const employee: any = await Employee.findOne({
            ...activeRecordFilter,
            client: { $regex: new RegExp(`^${escapeRegex(String(account.account_key || "").trim())}$`, "i") },
            username: String(username || "").trim().toLowerCase(),
        }).select("+password");
        if (!employee?.password || !(await bcrypt.compare(String(password || ""), employee.password))) {
            throw new Error("Invalid username or password");
        }

        const accessToken = crypto.randomBytes(32).toString("hex");
        const accessTtlHours = Number(process.env.EMPLOYEE_PORTAL_ACCESS_TTL_HOURS || 12);
        employee.portal_access_token_hash = hashSecret(accessToken);
        employee.portal_access_token_expires_at = new Date(Date.now() + accessTtlHours * 60 * 60 * 1000);
        await employee.save();

        return {
            access_token: accessToken,
            expires_in_hours: accessTtlHours,
            employee: this.getPortalEmployee(employee),
        };
    }

    async getTeacherClassroom(accountCode: string, employeeKey: string, accessToken: string, date?: string) {
        const teacher: any = await this.getAuthorizedTeacher(accountCode, employeeKey, accessToken);
        const classes = (teacher.classes || []).filter(Boolean);
        const students = classes.length ? await Student.find({
            client: { $regex: new RegExp(`^${escapeRegex(String(teacher.client))}$`, "i") },
            deleted: { $ne: true },
            status: { $ne: 0 },
            $or: [
                { class_batch: { $in: classes } },
                { courses: { $elemMatch: { course_name: { $in: classes }, deleted: { $ne: true } } } },
            ],
        }).select("name student_key phone_number email class_batch courses.course_name").lean() : [];

        const attendanceDate = String(date || new Date().toISOString().slice(0, 10));
        const attendance = await TeacherClassAttendance.find({ teacher: teacher._id, date: attendanceDate }).lean();
        const assignments = await TeacherAssignment.find({ teacher: teacher._id }).sort({ due_date: 1, createdAt: -1 }).lean();
        return { classes, students, attendance, assignments };
    }

    async markTeacherClassAttendance(accountCode: string, employeeKey: string, accessToken: string, data: any) {
        const teacher: any = await this.getAuthorizedTeacher(accountCode, employeeKey, accessToken);
        const className = String(data.class_name || "").trim();
        if (!(teacher.classes || []).includes(className)) throw new Error("You are not assigned to this class");
        const date = String(data.date || "").trim();
        if (!date || !Array.isArray(data.records)) throw new Error("Date and attendance records are required");

        const allowedStudentIds = new Set((await Student.find({
            _id: { $in: data.records.map((record: any) => record.student_id) },
            client: teacher.client,
            deleted: { $ne: true },
            $or: [{ class_batch: className }, { "courses.course_name": className }],
        }).select("_id").lean()).map((student: any) => String(student._id)));

        const operations = data.records
            .filter((record: any) => allowedStudentIds.has(String(record.student_id)))
            .map((record: any) => ({
                updateOne: {
                    filter: { teacher: teacher._id, student: record.student_id, class_name: className, date },
                    update: { $set: { client: teacher.client, status: record.status } },
                    upsert: true,
                },
            }));
        if (operations.length) await TeacherClassAttendance.bulkWrite(operations);
        return TeacherClassAttendance.find({ teacher: teacher._id, class_name: className, date }).lean();
    }

    async createTeacherAssignment(accountCode: string, employeeKey: string, accessToken: string, data: any) {
        const teacher: any = await this.getAuthorizedTeacher(accountCode, employeeKey, accessToken);
        const className = String(data.class_name || "").trim();
        if (!(teacher.classes || []).includes(className)) throw new Error("You are not assigned to this class");
        const assignmentType = this.normalizeAssignmentType(data.type);
        const startAt = String(data.start_at || data.startAt || "").trim();
        const endAt = String(data.end_at || data.endAt || "").trim();
        const dueDate = assignmentType === "online_test" ? endAt : String(data.due_date || data.dueDate || "").trim();
        if (!data.title || !assignmentType || (assignmentType === "online_test" ? (!startAt || !endAt) : !dueDate)) {
            throw new Error(assignmentType === "online_test" ? "Type, title, start time and end time are required" : "Type, title and due date are required");
        }
        const mcqQuestions = this.normalizeMcqQuestions(data.mcq_questions || data.mcqQuestions || []);
        const totalMarks = assignmentType === "online_test" ? this.mcqTotalMarks(mcqQuestions) : this.safeMarks(data.total_marks ?? data.totalMarks, "Total marks");
        return TeacherAssignment.create({
            client: teacher.client,
            teacher: teacher._id,
            type: assignmentType,
            class_name: className,
            subject: data.subject || "",
            title: data.title,
            description: data.description || "",
            due_date: dueDate,
            start_at: startAt,
            end_at: endAt,
            questions: Array.isArray(data.questions) ? data.questions.filter(Boolean) : [],
            mcq_questions: assignmentType === "online_test" ? mcqQuestions : [],
            total_marks: totalMarks,
            status: data.status || "published",
        });
    }

    async updateTeacherAssignment(accountCode: string, employeeKey: string, accessToken: string, assignmentId: string, data: any) {
        const teacher: any = await this.getAuthorizedTeacher(accountCode, employeeKey, accessToken);
        if (!mongoose.Types.ObjectId.isValid(assignmentId)) throw new Error("Invalid assignment");

        const className = String(data.class_name || "").trim();
        if (!(teacher.classes || []).includes(className)) throw new Error("You are not assigned to this class");
        const assignmentType = this.normalizeAssignmentType(data.type);
        const startAt = String(data.start_at || data.startAt || "").trim();
        const endAt = String(data.end_at || data.endAt || "").trim();
        const dueDate = assignmentType === "online_test" ? endAt : String(data.due_date || data.dueDate || "").trim();
        if (!data.title || !assignmentType || (assignmentType === "online_test" ? (!startAt || !endAt) : !dueDate)) {
            throw new Error(assignmentType === "online_test" ? "Type, title, start time and end time are required" : "Type, title and due date are required");
        }
        const mcqQuestions = this.normalizeMcqQuestions(data.mcq_questions || data.mcqQuestions || []);
        const totalMarks = assignmentType === "online_test" ? this.mcqTotalMarks(mcqQuestions) : this.safeMarks(data.total_marks ?? data.totalMarks, "Total marks");

        const updated = await TeacherAssignment.findOneAndUpdate(
            { _id: assignmentId, teacher: teacher._id, client: teacher.client },
            {
                $set: {
                    type: assignmentType,
                    class_name: className,
                    subject: data.subject || "",
                    title: data.title,
                    description: data.description || "",
                    due_date: dueDate,
                    start_at: startAt,
                    end_at: endAt,
                    questions: Array.isArray(data.questions) ? data.questions.filter(Boolean) : [],
                    mcq_questions: assignmentType === "online_test" ? mcqQuestions : [],
                    total_marks: totalMarks,
                    status: data.status || "published",
                },
            },
            { new: true, runValidators: true },
        ).lean();
        if (!updated) throw new Error("Assignment not found");
        return updated;
    }

    async updateTeacherAssignmentResults(accountCode: string, employeeKey: string, accessToken: string, assignmentId: string, data: any) {
        const teacher: any = await this.getAuthorizedTeacher(accountCode, employeeKey, accessToken);
        if (!mongoose.Types.ObjectId.isValid(assignmentId)) throw new Error("Invalid assignment");

        const assignment: any = await TeacherAssignment.findOne({
            _id: assignmentId,
            teacher: teacher._id,
            client: teacher.client,
            type: { $in: ["assignment", "homework", "offline_test", "online_test"] },
        });
        if (!assignment) throw new Error("Online test not found");
        if (!(teacher.classes || []).includes(assignment.class_name)) throw new Error("You are not assigned to this class");

        const students = await Student.find({
            client: { $regex: new RegExp(`^${escapeRegex(String(teacher.client))}$`, "i") },
            deleted: { $ne: true },
            status: { $ne: 0 },
            $or: [
                { class_batch: assignment.class_name },
                { courses: { $elemMatch: { course_name: assignment.class_name, deleted: { $ne: true } } } },
            ],
        }).select("_id").lean();

        const incoming = Array.isArray(data.results) ? data.results : [];
        const resultByStudent = new Map(incoming.map((record: any) => [
            String(record.student_id || record.student || record._id || ""),
            record,
        ]));
        const totalMarks = this.safeMarks(assignment.total_marks, "Total marks");

        const results = students.map((student: any) => {
            const record:any = resultByStudent.get(String(student._id)) || {};
            const rawMarks = record.marks ?? record.obtained_marks ?? record.obtainedMarks;
            const hasMarks = rawMarks !== undefined && rawMarks !== null && String(rawMarks).trim() !== "";
            const marks = hasMarks ? this.safeMarks(rawMarks, "Marks") : null;
            if (marks !== null && totalMarks > 0 && marks > totalMarks) throw new Error("Marks cannot be greater than total marks");
            return {
                student: student._id,
                marks,
                remarks: String(record?.remarks || "").trim(),
                status: hasMarks ? "completed" : "pending",
            };
        });

        assignment.results = results;
        if (data.publish === true || data.results_published === true) assignment.results_published = true;
        await assignment.save();
        return assignment.toObject();
    }

    private safeMarks(value: any, label: string) {
        if (value === undefined || value === null || String(value).trim() === "") return 0;
        const numberValue = Number(value);
        if (!Number.isFinite(numberValue) || numberValue < 0) throw new Error(`${label} must be zero or more`);
        return numberValue;
    }

    private normalizeAssignmentType(type: any) {
        const value = String(type || "").trim();
        if (value === "homework") return "assignment";
        return ["assignment", "offline_test", "online_test"].includes(value) ? value : "";
    }

    private normalizeMcqQuestions(questions: any[]) {
        return (Array.isArray(questions) ? questions : [])
            .map((question: any) => ({
                question: String(question.question || "").trim(),
                correct_answer: String(question.correct_answer || question.correctAnswer || "").trim(),
                wrong_answers: [question.wrong_answer_1, question.wrong_answer_2, question.wrong_answer_3, ...(question.wrong_answers || question.wrongAnswers || [])]
                    .map((answer: any) => String(answer || "").trim())
                    .filter(Boolean)
                    .slice(0, 3),
                correct_marks: this.safeAnyNumber(question.correct_marks ?? question.correctMarks ?? 1, "Correct marks"),
                wrong_marks: this.safeAnyNumber(question.wrong_marks ?? question.wrongMarks ?? 0, "Wrong marks"),
            }))
            .filter((question: any) => question.question && question.correct_answer && question.wrong_answers.length === 3);
    }

    private mcqTotalMarks(questions: any[]) {
        return questions.reduce((total, question) => total + Number(question.correct_marks || 0), 0);
    }

    private safeAnyNumber(value: any, label: string) {
        if (value === undefined || value === null || String(value).trim() === "") return 0;
        const numberValue = Number(value);
        if (!Number.isFinite(numberValue)) throw new Error(`${label} must be a valid number`);
        return numberValue;
    }

    async getAccountantWorkspace(accountCode: string, employeeKey: string, accessToken: string, month: string, year: string, date: string) {
        const accountant: any = await this.getAuthorizedAccountant(accountCode, employeeKey, accessToken);
        const client = accountant.client;
        const [employees, attendance, salaryReport, students, account] = await Promise.all([
            Employee.find({ client: { $regex: new RegExp(`^${escapeRegex(client)}$`, "i") }, ...activeRecordFilter })
                .select("employee_id name email phone staff_type non_teaching_category designation department joining_date salary status")
                .sort({ name: 1 }).lean(),
            this.getEmployeeAttendance(client, date || new Date().toISOString().slice(0, 10)),
            this.getSalaryReport(client, month, year),
            Student.find({ client: { $regex: new RegExp(`^${escapeRegex(client)}$`, "i") }, ...activeRecordFilter })
                .select("name student_key phone_number whatsapp_number email class_batch courses._id courses.course_name courses.course_fee courses.total_course_fee courses.pending_payment courses.payments")
                .sort({ name: 1 }).lean(),
            this.getAccountForEmployeeClient(client),
        ]);
        const employeeById = new Map((employees as any[]).map((employee: any) => [String(employee._id), employee]));
        const enrichedAttendance = (attendance as any[]).map((record: any) => ({
            ...record,
            employee: employeeById.get(String(record.employeeId || record.teacherId)) || null,
        }));
        return { employees, attendance: enrichedAttendance, salaryReport, students, settings: {
            employee_attendance_type: (account as any)?.employee_attendance_type || "status",
            payroll_standard_working_hours: Number((account as any)?.payroll_standard_working_hours) || 8,
            employee_salary_slip: (account as any)?.employee_salary_slip !== false,
        } };
    }

    async addAccountantStudentPayment(accountCode: string, employeeKey: string, accessToken: string, data: any) {
        const accountant: any = await this.getAuthorizedAccountant(accountCode, employeeKey, accessToken);
        const student: any = await Student.findOne({ _id: data.student_id, client: { $regex: new RegExp(`^${escapeRegex(accountant.client)}$`, "i") }, ...activeRecordFilter }).select("_id courses._id").lean();
        if (!student) throw new Error("Student not found in your school");
        if (!(student.courses || []).some((course: any) => String(course._id) === String(data.course_id))) throw new Error("Course not found for this student");
        const amount = Number(data.payment_amount);
        if (!Number.isFinite(amount) || amount <= 0) throw new Error("Payment amount must be greater than zero");
        return studentService.addPayment(String(data.student_id), String(data.course_id), {
            payment_mode: String(data.payment_mode || "").trim(),
            payment_amount: amount,
            payment_date: String(data.payment_date || new Date().toISOString().slice(0, 10)),
            payment_status: String(data.payment_status || "Paid"),
            remarks: String(data.remarks || "").trim(),
        }, { userRole: "accountant", employeeId: accountant._id });
    }

    async markAccountantStaffAttendance(accountCode: string, employeeKey: string, accessToken: string, data: any) {
        const accountant: any = await this.getAuthorizedAccountant(accountCode, employeeKey, accessToken);
        if (!Array.isArray(data.records) || !data.records.length) throw new Error("Attendance records are required");
        const allowedIds = new Set((await Employee.find({ _id: { $in: data.records.map((record: any) => record.employeeId) }, client: accountant.client, ...activeRecordFilter }).select("_id").lean()).map((employee: any) => String(employee._id)));
        const records = data.records.filter((record: any) => allowedIds.has(String(record.employeeId))).map((record: any) => ({ ...record, client: accountant.client }));
        if (!records.length) throw new Error("No valid staff attendance records found");
        return this.markBulkAttendance(records);
    }

    async getPortalChatContacts(accountCode: string, userKey: string, accessToken: string, role: string) {
        const current: any = role === "student" ? await this.getAuthorizedChatStudent(accountCode, userKey, accessToken) : await this.getAuthorizedChatStaff(accountCode, userKey, accessToken);
        const currentKind = role === "student" ? "student" : "staff";
        const [staff, students]: any[] = await Promise.all([
            Employee.find({ client: current.client, ...(currentKind === "staff" ? { _id: { $ne: current._id } } : {}), ...activeRecordFilter }).select("name employee_id designation staff_type non_teaching_category").sort({ name: 1 }).lean(),
            Student.find({ client: current.client, ...(currentKind === "student" ? { _id: { $ne: current._id } } : {}), ...activeRecordFilter }).select("name student_key class_batch").sort({ name: 1 }).lean(),
        ]);
        const contacts = [
            ...staff.map((person: any) => ({ id: person._id, kind: "staff", name: person.name, role_label: person.staff_type === "teaching" ? "Teacher" : this.chatRoleLabel(person.non_teaching_category || person.designation || "Staff"), subtitle: person.employee_id || person.designation || "Staff" })),
            ...students.map((person: any) => ({ id: person._id, kind: "student", name: person.name, role_label: "Student", subtitle: person.student_key || person.class_batch || "Student" })),
        ];
        if (currentKind === "staff" && current.staff_type === "teaching") {
            const teacherClasses = current.classes || [];
            const assignedChildren: any[] = await Student.find({ client: current.client, ...activeRecordFilter, $or: [{ class_batch: { $in: teacherClasses } }, { "courses.course_name": { $in: teacherClasses } }] }).select("_id name student_key").lean();
            const childById = new Map(assignedChildren.map((child: any) => [String(child._id), child]));
            const parents: any[] = assignedChildren.length ? await Parent.find({ client: current.client, children: { $in: assignedChildren.map((child: any) => child._id) }, deleted: { $ne: true }, status: 1 }).select("name children").lean() : [];
            for (const parent of parents) for (const childId of parent.children || []) {
                const child: any = childById.get(String(childId));
                if (child) contacts.push({ id: `parent:${parent._id}:${child._id}`, kind: "parent", name: parent.name, role_label: "Parent", subtitle: `Parent of ${child.name}`, parent_id: parent._id, child_id: child._id });
            }
        }
        return Promise.all(contacts.map(async (contact: any) => {
            const key = contact.kind === "parent" ? this.parentTeacherConversationKey(contact.parent_id, current._id, contact.child_id) : this.chatConversationKey(currentKind, current._id, contact.kind, contact.id);
            const [unread, messageCount] = await Promise.all([
                PortalChatMessage.countDocuments(contact.kind === "parent" ? { conversation_key: key, recipient_kind: "staff", recipient_id: current._id, read_at: null } : { recipient_kind: currentKind, recipient_id: current._id, sender_kind: contact.kind, sender_id: contact.id, read_at: null }),
                PortalChatMessage.countDocuments({ conversation_key: key }),
            ]);
            return { ...contact, unread, has_chat: messageCount > 0 };
        }));
    }

    async getPortalChatMessages(accountCode: string, userKey: string, accessToken: string, role: string, contactId: string) {
        if (contactId.startsWith("parent:")) return this.getTeacherParentMessages(accountCode, userKey, accessToken, contactId);
        const pair = await this.getAuthorizedChatPair(accountCode, userKey, accessToken, role, contactId);
        await PortalChatMessage.updateMany({ conversation_key: pair.key, recipient_kind: pair.currentKind, recipient_id: pair.current._id, read_at: null }, { $set: { read_at: new Date() } });
        const messages: any[] = await PortalChatMessage.find({ conversation_key: pair.key }).select("sender_kind message read_at createdAt").sort({ createdAt: 1 }).limit(500).lean();
        return messages.map((item: any) => ({ ...item, sender_role: item.sender_kind === "student" ? "student" : "teacher" }));
    }

    async sendPortalChatMessage(accountCode: string, userKey: string, accessToken: string, role: string, contactId: string, message: string) {
        const text = String(message || "").trim();
        if (!text) throw new Error("Message is required");
        if (contactId.startsWith("parent:")) return this.sendTeacherParentMessage(accountCode, userKey, accessToken, contactId, text);
        const pair = await this.getAuthorizedChatPair(accountCode, userKey, accessToken, role, contactId);
        return PortalChatMessage.create({ client: pair.current.client, conversation_key: pair.key, sender_kind: pair.currentKind, sender_id: pair.current._id, recipient_kind: pair.contactKind, recipient_id: pair.contact._id, message: text });
    }

    private async getAuthorizedChatPair(accountCode: string, userKey: string, accessToken: string, role: string, contactId: string) {
        if (!mongoose.Types.ObjectId.isValid(contactId)) throw new Error("Invalid chat contact");
        const current: any = role === "student" ? await this.getAuthorizedChatStudent(accountCode, userKey, accessToken) : await this.getAuthorizedChatStaff(accountCode, userKey, accessToken);
        const currentKind = role === "student" ? "student" : "staff";
        let contact: any = await Employee.findOne({ _id: contactId, client: current.client, ...activeRecordFilter }).lean();
        let contactKind = "staff";
        if (!contact) { contact = await Student.findOne({ _id: contactId, client: current.client, ...activeRecordFilter }).lean(); contactKind = "student"; }
        if (!contact || (currentKind === contactKind && String(current._id) === String(contact._id))) throw new Error("Chat contact not found");
        return { current, currentKind, contact, contactKind, key: this.chatConversationKey(currentKind, current._id, contactKind, contact._id) };
    }

    private chatConversationKey(firstKind: string, firstId: any, secondKind: string, secondId: any) { return [`${firstKind}:${firstId}`, `${secondKind}:${secondId}`].sort().join("|"); }
    private parentTeacherConversationKey(parentId: any, teacherId: any, childId: any) { return [`parent:${parentId}`, `staff:${teacherId}`, `child:${childId}`].join("|"); }
    private async authorizedTeacherParentPair(accountCode: string, userKey: string, accessToken: string, contactId: string) { const parts = contactId.split(":"); if (parts.length !== 3 || !mongoose.Types.ObjectId.isValid(parts[1]) || !mongoose.Types.ObjectId.isValid(parts[2])) throw new Error("Invalid parent chat"); const teacher: any = await this.getAuthorizedChatStaff(accountCode, userKey, accessToken); if (teacher.staff_type !== "teaching") throw new Error("Teacher access required"); const child: any = await Student.findOne({ _id: parts[2], client: teacher.client, ...activeRecordFilter, $or: [{ class_batch: { $in: teacher.classes || [] } }, { "courses.course_name": { $in: teacher.classes || [] } }] }).lean(); const parent: any = child ? await Parent.findOne({ _id: parts[1], client: teacher.client, children: child._id, deleted: { $ne: true }, status: 1 }).lean() : null; if (!child || !parent) throw new Error("Parent is not linked to an assigned student"); return { teacher, child, parent, key: this.parentTeacherConversationKey(parent._id, teacher._id, child._id) }; }
    private async getTeacherParentMessages(accountCode:string,userKey:string,accessToken:string,contactId:string){const pair=await this.authorizedTeacherParentPair(accountCode,userKey,accessToken,contactId);await PortalChatMessage.updateMany({conversation_key:pair.key,recipient_kind:"staff",recipient_id:pair.teacher._id,read_at:null},{$set:{read_at:new Date()}});const rows:any[]=await PortalChatMessage.find({conversation_key:pair.key}).select("sender_kind message read_at createdAt").sort({createdAt:1}).lean();return rows.map(row=>({...row,sender_role:row.sender_kind==="staff"?"teacher":"parent"}));}
    private async sendTeacherParentMessage(accountCode:string,userKey:string,accessToken:string,contactId:string,message:string){const pair=await this.authorizedTeacherParentPair(accountCode,userKey,accessToken,contactId);return PortalChatMessage.create({client:pair.teacher.client,conversation_key:pair.key,sender_kind:"staff",sender_id:pair.teacher._id,recipient_kind:"parent",recipient_id:pair.parent._id,message});}
    private chatRoleLabel(value: any) { const text = String(value || "Staff").replace(/_/g, " "); return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase(); }

    private async getAuthorizedChatStaff(accountCode: string, employeeKey: string, accessToken: string) {
        const employee: any = await this.findEmployeeByAccountCodeAndKey(accountCode, employeeKey, { portal_access_token_hash: hashSecret(accessToken), portal_access_token_expires_at: { $gt: new Date() } }, true);
        if (!employee) throw new Error("Staff access is invalid or expired");
        return employee;
    }

    private async getAuthorizedChatStudent(accountCode: string, studentKey: string, accessToken: string) {
        const account: any = await Account.findOne({ account_code: { $regex: new RegExp(`^${escapeRegex(accountCode)}$`, "i") }, status: { $ne: 0 } }).lean();
        if (!account) throw new Error("Account not found");
        const filters: any[] = [{ student_key: { $regex: new RegExp(`^${escapeRegex(studentKey)}$`, "i") } }];
        if (mongoose.Types.ObjectId.isValid(studentKey)) filters.push({ _id: studentKey });
        const student: any = await Student.findOne({ client: account.account_key, ...activeRecordFilter, $or: filters, portal_access_token_hash: hashSecret(accessToken), portal_access_token_expires_at: { $gt: new Date() } }).select("+portal_access_token_hash +portal_access_token_expires_at name student_key client class_batch courses.course_name").lean();
        if (!student) throw new Error("Student access is invalid or expired");
        return student;
    }

    private async getAuthorizedAccountant(accountCode: string, employeeKey: string, accessToken: string) {
        const employee: any = await this.findEmployeeByAccountCodeAndKey(accountCode, employeeKey, {
            portal_access_token_hash: hashSecret(String(accessToken || "")),
            portal_access_token_expires_at: { $gt: new Date() },
            staff_type: "non_teaching",
        }, true);
        if (!employee || String(employee.non_teaching_category || "").trim().toLowerCase() !== "accountant") {
            throw new Error("Accountant access is invalid or expired");
        }
        return employee;
    }

    private async getAuthorizedTeacher(accountCode: string, employeeKey: string, accessToken: string) {
        const teacher: any = await this.findEmployeeByAccountCodeAndKey(accountCode, employeeKey, {
            portal_access_token_hash: hashSecret(String(accessToken || "")),
            portal_access_token_expires_at: { $gt: new Date() },
            staff_type: "teaching",
        }, true);
        if (!teacher) throw new Error("Teacher access is invalid or expired");
        return teacher;
    }

    private async syncCustomFieldLabels(client: string, customFields: { label: string }[]) {
        const labels = customFields.map(f => f.label);
        await Account.findOneAndUpdate(
            {
                $or: [
                    { account_name: client },
                    { account_key: client },
                    { "outlets.outlet_key": client },
                ],
            },
            {
                $addToSet: {
                    custom_employee_fields: { $each: labels },
                    custom_teacher_fields: { $each: labels }
                }
            }
        );
    }

    private async findEmployeeByAccountCodeAndKey(accountCode: string, employeeKey: string, extraFilter: Record<string, any> = {}, staffPortal = false) {
        const account = await Account.findOne({
            account_code: { $regex: new RegExp(`^${escapeRegex(String(accountCode || "").trim())}$`, "i") },
            status: { $ne: 0 },
        }).lean();
        if (!account) throw new Error("ACCOUNTS.NOT_FOUND");
        if (staffPortal && account.org_subtype !== "school") {
            throw new Error("Staff login is available only for school accounts");
        }

        const normalizedEmployeeKey = String(employeeKey || "").trim();
        const idFilters: any[] = [
            { employee_id: { $regex: new RegExp(`^${escapeRegex(normalizedEmployeeKey)}$`, "i") } },
            { email: { $regex: new RegExp(`^${escapeRegex(normalizedEmployeeKey)}$`, "i") } },
        ];
        if (mongoose.Types.ObjectId.isValid(normalizedEmployeeKey)) {
            idFilters.push({ _id: normalizedEmployeeKey });
        }

        return Employee.findOne({
            ...activeRecordFilter,
            ...extraFilter,
            client: { $regex: new RegExp(`^${escapeRegex(String(account.account_key || "").trim())}$`, "i") },
            $or: idFilters,
        }).select("+portal_otp_hash +portal_otp_expires_at +portal_access_token_hash +portal_access_token_expires_at").lean();
    }

    private getEmployeePublicId(employee: any) {
        return employee.employee_id || String(employee._id || "").slice(0, 8).toUpperCase();
    }

    private getPortalEmployee(employee: any) {
        return {
            _id: employee._id,
            employee_id: this.getEmployeePublicId(employee),
            name: employee.name,
            email: maskEmail(employee.email),
            designation: employee.designation || "",
            joining_date: employee.joining_date || "",
            client: employee.client,
            staff_type: employee.staff_type || "",
            non_teaching_category: employee.non_teaching_category || "",
            phone: employee.phone || "",
            dob: employee.dob || "",
            gender: employee.gender || "",
            address: employee.address || "",
            qualification: employee.qualification || "",
            experience_years: employee.experience_years || 0,
            experience_summary: employee.experience_summary || "",
            department: employee.department || "",
            subjects: employee.subjects || [],
            classes: employee.classes || [],
            assigned_courses: employee.assigned_courses || [],
            documents: employee.documents || [],
            performance_rating: employee.performance_rating || 0,
            performance_notes: employee.performance_notes || "",
            leave_balance: employee.leave_balance || { casual: 0, sick: 0, earned: 0 },
        };
    }

    private normalizeEmployeeId(value: any) {
        return String(value || "").trim().toUpperCase();
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

    private async getAccountForEmployeeClient(client: string) {
        const escapedClient = escapeRegex(String(client || "").trim());
        return Account.findOne({
            $or: [
                { account_key: { $regex: new RegExp(`^${escapedClient}$`, "i") } },
                { account_name: { $regex: new RegExp(`^${escapedClient}$`, "i") } },
                { "outlets.outlet_key": { $regex: new RegExp(`^${escapedClient}$`, "i") } },
            ],
        }).lean();
    }

    private async getEmployeeIdSettings(client: string) {
        const account: any = await this.getAccountForEmployeeClient(client);
        const prefix = this.normalizeIdPrefix(account?.employee_id_prefix, "EMP");
        const totalLength = this.normalizeIdTotalLength(
            account?.employee_id_total_length,
            prefix,
            9
        );

        return {
            mode: account?.employee_id_mode === "manual" ? "manual" : "auto",
            prefix,
            totalLength,
            digitLength: totalLength - prefix.length,
        };
    }

    private async validateSchoolStaffType(client: string, staffType: string, category?: string, data?: any) {
        const account: any = await this.getAccountForEmployeeClient(client);
        if (account?.org_subtype === "school" && !["teaching", "non_teaching"].includes(staffType)) {
            throw new Error("Staff type must be Teaching or Non-Teaching for school accounts");
        }
        if (account?.org_subtype === "school" && staffType === "non_teaching" && !["accountant", "driver", "security"].includes(String(category || "").toLowerCase())) {
            throw new Error("Non-Teaching category must be Accountant, Driver or Security");
        }
        if (staffType === "teaching" && data) delete data.non_teaching_category;
    }

    private async prepareStaffCredentials(data: any, client: string, isCreate: boolean, employeeId?: string) {
        const account: any = await this.getAccountForEmployeeClient(client);
        if (account?.org_subtype !== "school") {
            delete data.username;
            delete data.password;
            return;
        }

        data.username = String(data.username || "").trim().toLowerCase();
        if (!data.username) throw new Error("Username is required for school staff");

        const duplicate = await Employee.findOne({
            client,
            username: data.username,
            ...(employeeId ? { _id: { $ne: employeeId } } : {}),
            ...activeRecordFilter,
        }).lean();
        if (duplicate) throw new Error("Username is already in use for this account");

        if (data.password) {
            if (String(data.password).length < 8) throw new Error("Password must be at least 8 characters");
            data.password = await bcrypt.hash(String(data.password), 10);
        } else if (isCreate) {
            throw new Error("Password is required for school staff");
        } else {
            delete data.password;
        }
    }

    private async generateEmployeeId(client: string, settings = null as any) {
        const idSettings = settings || await this.getEmployeeIdSettings(client);
        const latest = await Employee.findOne({
            client: { $regex: new RegExp(`^${escapeRegex(String(client || "").trim())}$`, "i") },
            employee_id: {
                $regex: new RegExp(`^${escapeRegex(idSettings.prefix)}\\d{${idSettings.digitLength}}$`, "i"),
            },
        })
            .sort({ employee_id: -1 })
            .select("employee_id")
            .lean();
        const latestSequence = Number(String(latest?.employee_id || "").slice(idSettings.prefix.length)) || 0;
        return `${idSettings.prefix}${String(latestSequence + 1).padStart(idSettings.digitLength, "0")}`;
    }

    private canManageEmployeeId(user: any) {
        return String(user?.userRole || "").toLowerCase() === "head_office";
    }

    private async assertUniqueEmployeeId(client: string, employeeId: string, excludeId?: string) {
        if (!employeeId) return;
        const duplicate = await Employee.findOne({
            ...activeRecordFilter,
            ...(excludeId ? { _id: { $ne: excludeId } } : {}),
            client,
            employee_id: { $regex: new RegExp(`^${escapeRegex(employeeId)}$`, "i") },
        }).lean();
        if (duplicate) {
            throw new Error("Employee ID already exists for this client");
        }
    }

    private getPayrollPolicy(account: any) {
        const calcDays = Number(account?.salary_calculation_days) || DEFAULT_POLICY.calcDays;
        const weeklyHolidays = Array.isArray(account?.payroll_weekly_holidays)
            ? account.payroll_weekly_holidays.map(Number).filter((day: number) => day >= 0 && day <= 6)
            : DEFAULT_POLICY.weeklyHolidays;

        return {
            salaryBasisType: account?.payroll_salary_basis_type || DEFAULT_POLICY.salaryBasisType,
            calcDays,
            weeklyHolidays: weeklyHolidays.length ? weeklyHolidays : DEFAULT_POLICY.weeklyHolidays,
            holidayEligibility: account?.payroll_holiday_eligibility || DEFAULT_POLICY.holidayEligibility,
            consecutiveHolidayEligibility: account?.payroll_consecutive_holiday_eligibility || DEFAULT_POLICY.consecutiveHolidayEligibility,
            holidayWorkPolicy: account?.payroll_holiday_work_policy || DEFAULT_POLICY.holidayWorkPolicy,
            holidayWorkMultiplier: Number(account?.payroll_holiday_work_multiplier) || DEFAULT_POLICY.holidayWorkMultiplier,
            compOffExtraMultiplier: Number(account?.payroll_comp_off_extra_multiplier) || DEFAULT_POLICY.compOffExtraMultiplier,
            standardWorkingHours: Number(account?.payroll_standard_working_hours) || DEFAULT_POLICY.standardWorkingHours,
            fullDayHours: Number(account?.payroll_full_day_hours) || DEFAULT_POLICY.fullDayHours,
            halfDayHours: Number(account?.payroll_half_day_hours) || DEFAULT_POLICY.halfDayHours,
            overtimeStartAfterHours: Number(account?.payroll_overtime_start_after_hours) || DEFAULT_POLICY.overtimeStartAfterHours,
            overtimeMethod: account?.payroll_overtime_method || DEFAULT_POLICY.overtimeMethod,
            overtimeMultiplier: Number(account?.payroll_overtime_multiplier) || DEFAULT_POLICY.overtimeMultiplier,
            halfDayRatio: Number(account?.payroll_half_day_ratio ?? DEFAULT_POLICY.halfDayRatio),
        };
    }

    private normalizeDateKey(value: any) {
        if (!value) return toDateKey(new Date());
        if (value instanceof Date) return toDateKey(value);

        const text = String(value).trim();
        const dayMonthYear = /^(\d{2})-(\d{2})-(\d{4})$/.exec(text);
        if (dayMonthYear) {
            return `${dayMonthYear[3]}-${dayMonthYear[2]}-${dayMonthYear[1]}`;
        }

        const isoDate = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
        if (isoDate) return `${isoDate[1]}-${isoDate[2]}-${isoDate[3]}`;

        const parsed = new Date(text);
        return Number.isNaN(parsed.getTime()) ? toDateKey(new Date()) : toDateKey(parsed);
    }

    private normalizeSalaryHistory(history: any, fallbackAmount: number, fallbackDate: string) {
        const normalized = Array.isArray(history)
            ? history
                .map((item: any) => ({
                    amount: Number(item?.amount) || 0,
                    effective_date: this.normalizeDateKey(item?.effective_date || fallbackDate),
                }))
                .filter((item: any) => item.amount >= 0 && item.effective_date)
            : [];

        if (normalized.length === 0) {
            normalized.push({
                amount: Number(fallbackAmount) || 0,
                effective_date: fallbackDate,
            });
        }

        return normalized.sort((a: any, b: any) => a.effective_date.localeCompare(b.effective_date));
    }

    private getEffectiveSalary(employee: any, month: number, year: number) {
        const periodEnd = monthEndDateKey(month, year);
        const fallbackDate = this.normalizeDateKey(employee.joining_date || employee.createdAt || periodEnd);
        const history = this.normalizeSalaryHistory(
            employee.salary_history,
            Number(employee.salary) || 0,
            fallbackDate
        );
        const applicable = history
            .filter((item: any) => item.effective_date <= periodEnd)
            .sort((a: any, b: any) => b.effective_date.localeCompare(a.effective_date))[0] || history[0];

        return {
            amount: Number(applicable?.amount) || 0,
            effectiveDate: applicable?.effective_date || fallbackDate,
        };
    }

    private getQualifiedStatus(status: AttendanceStatus | undefined, workHours: number, policy: any): AttendanceStatus {
        if (status === "Paid Leave" || status === "Unpaid Leave") return status;
        if (workHours > 0) {
            if (workHours >= policy.fullDayHours) return "Present";
            if (workHours >= policy.halfDayHours) return "Half Day";
            return "Absent";
        }
        return status || "Absent";
    }

    private isWorkedStatus(status: AttendanceStatus) {
        return status === "Present" || status === "Half Day";
    }

    private getHolidayWorkedPayUnits(policy: any) {
        switch (policy.holidayWorkPolicy) {
            case "double_pay": return 2;
            case "custom_multiplier": return policy.holidayWorkMultiplier;
            case "comp_off": return 1;
            case "comp_off_extra_pay": return 1 + policy.compOffExtraMultiplier;
            case "normal_pay":
            default: return 1;
        }
    }

    private getHolidayCompOffDays(policy: any) {
        return policy.holidayWorkPolicy === "comp_off" || policy.holidayWorkPolicy === "comp_off_extra_pay" ? 1 : 0;
    }

    private getOvertimeHours(workHours: number, policy: any) {
        return Math.max(workHours - policy.overtimeStartAfterHours, 0);
    }

    private getOvertimeAmount(overtimeHours: number, dailyRate: number, hourlyRate: number, policy: any) {
        if (!overtimeHours) return 0;
        if (policy.overtimeMethod === "daily" || policy.overtimeMethod === "hybrid") {
            const fullDayOtUnits = Math.floor(overtimeHours / policy.fullDayHours);
            const remainingHours = overtimeHours % policy.fullDayHours;
            if (policy.overtimeMethod === "hybrid") {
                return ((fullDayOtUnits * dailyRate) + (remainingHours * hourlyRate)) * policy.overtimeMultiplier;
            }
            const halfDayOtUnits = remainingHours >= policy.halfDayHours ? 0.5 : 0;
            return (fullDayOtUnits + halfDayOtUnits) * dailyRate * policy.overtimeMultiplier;
        }
        return overtimeHours * hourlyRate * policy.overtimeMultiplier;
    }

    private getHolidayChains(dates: { key: string; day: number }[], weeklyHolidays: number[]) {
        const chains = new Map<string, { length: number; previousKey: string; nextKey: string }>();
        let index = 0;
        while (index < dates.length) {
            if (!weeklyHolidays.includes(dates[index].day)) {
                index += 1;
                continue;
            }
            const startIndex = index;
            while (index + 1 < dates.length && weeklyHolidays.includes(dates[index + 1].day)) {
                index += 1;
            }
            const endIndex = index;
            const previousDate = new Date(`${dates[startIndex].key}T00:00:00.000Z`);
            previousDate.setUTCDate(previousDate.getUTCDate() - 1);
            const nextDate = new Date(`${dates[endIndex].key}T00:00:00.000Z`);
            nextDate.setUTCDate(nextDate.getUTCDate() + 1);
            const chain = {
                length: endIndex - startIndex + 1,
                previousKey: toDateKey(previousDate),
                nextKey: toDateKey(nextDate),
            };
            for (let chainIndex = startIndex; chainIndex <= endIndex; chainIndex += 1) {
                chains.set(dates[chainIndex].key, chain);
            }
            index += 1;
        }
        return chains;
    }

    private isHolidayPaid(dateKey: string, chains: Map<string, any>, attendanceByDate: Map<string, any>, policy: any) {
        const chain = chains.get(dateKey);
        if (!chain) return false;
        const rule = chain.length > 1 ? policy.consecutiveHolidayEligibility : policy.holidayEligibility;
        if (rule === "always") return true;

        const previousPresent = this.isPresentForHolidayEligibility(attendanceByDate.get(chain.previousKey) as any, policy);
        const nextPresent = this.isPresentForHolidayEligibility(attendanceByDate.get(chain.nextKey) as any, policy);

        if (rule === "previous") return previousPresent;
        if (rule === "next") return nextPresent;
        if (rule === "both") return previousPresent && nextPresent;
        if (rule === "either") return previousPresent || nextPresent;
        return false;
    }

    private isPresentForHolidayEligibility(record: any, policy: any) {
        if (!record) return false;
        return this.isWorkedStatus(this.getQualifiedStatus(record.status, Number(record.workHours) || 0, policy));
    }
}

export default new EmployeeService();
