import mongoose, { Schema, Document } from 'mongoose';
import { allowedEmailValidator } from '../../../utils/emailValidation';

export interface IService {
    label: string;
    value: string;
    user: number;
    end_date: string | null;
    active: boolean;
    req: number;
    reason: string;
    username: string;
    email: string;
    req_user_role: string;
    updatedAt: Date | null;
}

export interface IOutlet {
    outlet_name: string;
    outlet_key: string;
    slip_key?: string;
    location: string;
    company_address: string;
    country: string;
    state: string;
    city: string;
    postal_code: string;
    contact_number: string;
    email: string;
    status: number;
    is_default: boolean;
    deleted?: boolean;
    deleted_at?: Date | null;
    deleted_by?: {
        user_id?: mongoose.Types.ObjectId;
        username?: string;
        name?: string;
        role?: string;
    };
}

export interface IAccount extends Document {
    account_name: string;
    account_code: string;
    account_key: string;
    account_owner: string;
    email: string;
    email_verified: boolean;
    email_verified_at?: Date | null;
    email_verification_token_hash?: string;
    email_verification_expires_at?: Date | null;
    email_verification_sent_at?: Date | null;
    industry: string;
    company_address: string;
    country: string;
    state: string;
    city: string;
    postal_code: string;
    contact_number: string;
    client_type: 'franchise' | 'outlet';
    product_master: 'required' | 'not required';
    languages: { value: string; label: string }[];
    slip_key: string;
    status: number;
    services: IService[];
    outlets: IOutlet[];
    org_type: 'educational' | 'production' | 'service';
    org_subtype?: 'school' | 'institute' | '';
    logo_url?: string;
    signature?: string;
    signature_trainer?: string;
    student_module: boolean;
    master_course_module: boolean;
    attendance_module: boolean;
    attendance_type: 'single' | 'course_wise';
    membership_module: boolean;
    master_membership_type_module: boolean;
    membership_attendance_module: boolean;
    membership_payments_module: boolean;
    salary_calculation_days: number;
    payroll_salary_basis_type?: 'calendar_days' | 'fixed_working_days';
    payroll_weekly_holidays?: number[];
    payroll_holiday_eligibility?: 'previous' | 'next' | 'both' | 'either' | 'always';
    payroll_consecutive_holiday_eligibility?: 'previous' | 'next' | 'both' | 'either' | 'always';
    payroll_holiday_work_policy?: 'normal_pay' | 'double_pay' | 'custom_multiplier' | 'comp_off' | 'comp_off_extra_pay';
    payroll_holiday_work_multiplier?: number;
    payroll_comp_off_extra_multiplier?: number;
    payroll_standard_working_hours?: number;
    payroll_full_day_hours?: number;
    payroll_half_day_hours?: number;
    payroll_overtime_start_after_hours?: number;
    payroll_overtime_method?: 'hourly' | 'daily' | 'hybrid';
    payroll_overtime_multiplier?: number;
    payroll_fixed_allowance?: number;
    payroll_fixed_deduction?: number;
    payroll_pf_percent?: number;
    payroll_esi_percent?: number;
    payroll_professional_tax?: number;
    payroll_half_day_ratio?: number;
    custom_employee_fields: string[];
    employee_module: boolean;
    employee_attendance_module: boolean;
    employee_attendance_type?: 'check_in_only' | 'check_in_out';
    employee_attendance_cutoff_day?: number;
    employee_salary_report: boolean;
    employee_salary_slip: boolean;
    custom_teacher_fields?: string[];
    teacher_module?: boolean;
    teacher_attendance_module?: boolean;
    teacher_attendance_cutoff_day?: number;
    teacher_salary_report?: boolean;
    teacher_salary_slip?: boolean;
    custom_student_fields: string[];
    student_id_mode: 'auto' | 'manual';
    student_id_prefix: string;
    student_id_total_length: number;
    employee_id_mode: 'auto' | 'manual';
    employee_id_prefix: string;
    employee_id_total_length: number;
    certificate_needed: boolean;
    certificate_template?: 'blue' | 'classic';
    custom_user_fields: string[];
    custom_fields: { label: string; value: string }[];
}

const ServiceSchema: Schema = new Schema({
    label: { type: String, required: true, trim: true },
    value: { type: String, required: true, trim: true },
    user: { type: Number, default: 0 },
    end_date: { type: String, default: null }, // Using String as per request
    active: { type: Boolean, default: false },
    req: { type: Number, default: 0 },
    reason: { type: String, default: "" },
    username: { type: String, trim: true, default: "" },
    email: { type: String, trim: true, default: "", validate: allowedEmailValidator },
    req_user_role: { type: String, trim: true, default: "" },
    updatedAt: { type: Date, default: null }
}, { _id: false });

const OutletSchema: Schema = new Schema({
    outlet_name: { type: String, required: true, trim: true },
    outlet_key: { type: String, required: true, trim: true },
    slip_key: { type: String, trim: true, default: "" },
    location: { type: String, trim: true, default: "" },
    company_address: { type: String, trim: true, default: "" },
    country: { type: String, trim: true, default: "" },
    state: { type: String, trim: true, default: "" },
    city: { type: String, trim: true, default: "" },
    postal_code: { type: String, trim: true, default: "" },
    contact_number: { type: String, trim: true, default: "" },
    email: { type: String, trim: true, default: "", validate: allowedEmailValidator },
    status: { type: Number, default: 1 },
    is_default: { type: Boolean, default: false },
    deleted: { type: Boolean, default: false },
    deleted_at: { type: Date, default: null },
    deleted_by: {
        user_id: { type: Schema.Types.ObjectId, ref: "User", default: null },
        username: { type: String, default: "" },
        name: { type: String, default: "" },
        role: { type: String, default: "" },
    },
}, { timestamps: true });

const AccountSchema: Schema = new Schema({
    account_name: { type: String, required: true, trim: true, unique: true },
    account_code: { type: String, required: false, trim: true, unique: true, sparse: true },
    account_key: { type: String, required: true, trim: true, unique: true },
    account_owner: { type: String, trim: true },
    email: { type: String, trim: true, validate: allowedEmailValidator },
    email_verified: { type: Boolean, default: false },
    email_verified_at: { type: Date, default: null },
    email_verification_token_hash: { type: String, default: "", select: false },
    email_verification_expires_at: { type: Date, default: null, select: false },
    email_verification_sent_at: { type: Date, default: null },
    company_address: { type: String, trim: true },
    country: { type: String, trim: true },
    state: { type: String, trim: true },
    city: { type: String, trim: true },
    postal_code: { type: String, trim: true },
    contact_number: { type: String, trim: true },
    client_type: {
        type: String,
        enum: ["franchise", "outlet"],
        default: "franchise",
        trim: true
    },
    domain: { type: String, trim: true, default: "" },
    product_master: {
        type: String,
        enum: ["required", "not required"],
        default: "not required",
        trim: true
    },
    languages: {
        type: [{
            value: { type: String, required: true },
            label: { type: String, required: true }
        }],
        default: []
    },
    slip_key: { type: String, trim: true, unique: true, default: "" },
    status: { type: Number, default: 1 }, // 1 = Active, 0 = Inactive
    services: { type: [ServiceSchema], default: [] },
    outlets: { type: [OutletSchema], default: [] },
    org_type: {
        type: String,
        enum: ["educational", "production", "service"],
        default: "educational",
        trim: true
    },
    org_subtype: {
        type: String,
        enum: ["school", "institute", ""],
        default: "institute",
        trim: true
    },
    logo_url: { type: String, trim: true, default: "" },
    signature: { type: String, trim: true, default: "" },
    signature_trainer: { type: String, trim: true, default: "" },
    student_module: { type: Boolean, default: true },
    master_course_module: { type: Boolean, default: true },
    attendance_module: { type: Boolean, default: true },
    attendance_type: {
        type: String,
        enum: ["single", "course_wise"],
        default: "single",
        trim: true
    },
    membership_module: { type: Boolean, default: false },
    master_membership_type_module: { type: Boolean, default: false },
    membership_attendance_module: { type: Boolean, default: false },
    membership_payments_module: { type: Boolean, default: false },
    salary_calculation_days: { type: Number, default: 30 },
    payroll_salary_basis_type: {
        type: String,
        enum: ["calendar_days", "fixed_working_days"],
        default: "calendar_days",
        trim: true
    },
    payroll_weekly_holidays: { type: [Number], default: [0] },
    payroll_holiday_eligibility: {
        type: String,
        enum: ["previous", "next", "both", "either", "always"],
        default: "always",
        trim: true
    },
    payroll_consecutive_holiday_eligibility: {
        type: String,
        enum: ["previous", "next", "both", "either", "always"],
        default: "always",
        trim: true
    },
    payroll_holiday_work_policy: {
        type: String,
        enum: ["normal_pay", "double_pay", "custom_multiplier", "comp_off", "comp_off_extra_pay"],
        default: "normal_pay",
        trim: true
    },
    payroll_holiday_work_multiplier: { type: Number, default: 1 },
    payroll_comp_off_extra_multiplier: { type: Number, default: 0.5 },
    payroll_standard_working_hours: { type: Number, default: 8 },
    payroll_full_day_hours: { type: Number, default: 8 },
    payroll_half_day_hours: { type: Number, default: 4 },
    payroll_overtime_start_after_hours: { type: Number, default: 8 },
    payroll_overtime_method: {
        type: String,
        enum: ["hourly", "daily", "hybrid"],
        default: "hourly",
        trim: true
    },
    payroll_overtime_multiplier: { type: Number, default: 1.5 },
    payroll_fixed_allowance: { type: Number, default: 0 },
    payroll_fixed_deduction: { type: Number, default: 0 },
    payroll_pf_percent: { type: Number, default: 0 },
    payroll_esi_percent: { type: Number, default: 0 },
    payroll_professional_tax: { type: Number, default: 0 },
    payroll_half_day_ratio: { type: Number, default: 0.5 },
    custom_employee_fields: { type: [String], default: [] },
    employee_module: { type: Boolean, default: false },
    employee_attendance_module: { type: Boolean, default: false },
    employee_attendance_type: {
        type: String,
        enum: ["check_in_only", "check_in_out"],
        default: "check_in_only",
        trim: true
    },
    employee_attendance_cutoff_day: { type: Number, default: 2 },
    employee_salary_report: { type: Boolean, default: false },
    employee_salary_slip: { type: Boolean, default: false },
    custom_teacher_fields: { type: [String], default: undefined },
    teacher_module: { type: Boolean, default: undefined },
    teacher_attendance_module: { type: Boolean, default: undefined },
    teacher_attendance_cutoff_day: { type: Number, default: undefined },
    teacher_salary_report: { type: Boolean, default: undefined },
    teacher_salary_slip: { type: Boolean, default: undefined },
    custom_student_fields: { type: [String], default: [] },
    student_id_mode: {
        type: String,
        enum: ["auto", "manual"],
        default: "auto",
        trim: true
    },
    student_id_prefix: { type: String, trim: true, default: "STU" },
    student_id_total_length: { type: Number, default: 9, min: 2 },
    employee_id_mode: {
        type: String,
        enum: ["auto", "manual"],
        default: "auto",
        trim: true
    },
    employee_id_prefix: { type: String, trim: true, default: "EMP" },
    employee_id_total_length: { type: Number, default: 9, min: 2 },
    certificate_needed: { type: Boolean, default: true },
    certificate_template: {
        type: String,
        enum: ["blue", "classic"],
        default: "blue",
        trim: true,
    },
    custom_user_fields: { type: [String], default: [] },
    custom_fields: {
      type: [
        {
          label: String,
          value: String,
          _id: false,
        },
      ],
      default: [],
    },
}, { timestamps: true });

export default mongoose.model<IAccount>('Account', AccountSchema);
