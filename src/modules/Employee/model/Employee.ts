import mongoose, { Schema, Document } from "mongoose";
import { allowedEmailValidator } from "../../../utils/emailValidation";

export interface IEmployee extends Document {
  employee_id?: string;
  name: string;
  email: string;
  phone: string;
  client: string; // Account association (account_name)
  staff_type?: "teaching" | "non_teaching";
  non_teaching_category?: "accountant" | "driver" | "security";
  username?: string;
  password?: string;

  // Personal Details
  dob?: string;
  gender?: string;
  address?: string;

  // Professional Details
  designation?: string;
  qualification?: string;
  experience_years?: number;
  experience_summary?: string;
  department?: string;
  subjects?: string[];
  classes?: string[];
  assigned_courses?: string[];
  joining_date?: string;
  status: number; // 1 = Active, 0 = Inactive
  salary: number; // Current Monthly Salary
  salary_history: {
    amount: number;
    effective_date: string;
  }[];
  documents?: { name: string; url: string }[];
  performance_rating?: number;
  performance_notes?: string;
  leave_balance?: { casual: number; sick: number; earned: number };
  portal_otp_hash?: string;
  portal_otp_expires_at?: Date | null;
  portal_otp_sent_at?: Date | null;
  portal_access_token_hash?: string;
  portal_access_token_expires_at?: Date | null;

  // Bank Details
  bank_name?: string;
  account_number?: string;
  ifsc_code?: string;
  branch_name?: string;

  custom_fields: { label: string; value: string }[];
  deleted: boolean;
  deleted_at?: Date | null;
  deleted_by?: {
    user_id?: mongoose.Types.ObjectId;
    username?: string;
    name?: string;
    role?: string;
  };
  createdAt?: Date;
  updatedAt?: Date;
}

const EmployeeSchema: Schema = new Schema(
  {
    employee_id: { type: String, trim: true, default: "" },
    name: { type: String, required: true, trim: true },
    email: { type: String, trim: true, validate: allowedEmailValidator },
    phone: { type: String, trim: true },
    client: { type: String, required: true, trim: true },
    staff_type: {
      type: String,
      enum: ["teaching", "non_teaching"],
      default: undefined,
      trim: true,
    },
    non_teaching_category: {
      type: String,
      enum: ["accountant", "driver", "security"],
      default: undefined,
      trim: true,
      lowercase: true,
    },
    username: { type: String, trim: true, lowercase: true, default: undefined },
    password: { type: String, select: false, default: undefined },

    // Personal Details
    dob: { type: String, trim: true },
    gender: { type: String, trim: true },
    address: { type: String, trim: true },

    // Professional Details
    designation: { type: String, trim: true },
    qualification: { type: String, trim: true },
    experience_years: { type: Number, default: 0, min: 0 },
    experience_summary: { type: String, trim: true, default: "" },
    department: { type: String, trim: true, default: "" },
    subjects: { type: [String], default: [] },
    classes: { type: [String], default: [] },
    assigned_courses: { type: [String], default: [] },
    joining_date: { type: String, trim: true },
    status: { type: Number, default: 1 },
    salary: { type: Number, default: 0 },
    salary_history: {
      type: [
        {
          amount: { type: Number, required: true, default: 0 },
          effective_date: { type: String, required: true, trim: true },
          _id: false,
        },
      ],
      default: [],
    },
    documents: {
      type: [{ name: { type: String, trim: true }, url: { type: String, trim: true }, _id: false }],
      default: [],
    },
    performance_rating: { type: Number, min: 0, max: 5, default: 0 },
    performance_notes: { type: String, trim: true, default: "" },
    leave_balance: {
      casual: { type: Number, default: 0, min: 0 },
      sick: { type: Number, default: 0, min: 0 },
      earned: { type: Number, default: 0, min: 0 },
    },
    portal_otp_hash: { type: String, default: "", select: false },
    portal_otp_expires_at: { type: Date, default: null, select: false },
    portal_otp_sent_at: { type: Date, default: null },
    portal_access_token_hash: { type: String, default: "", select: false },
    portal_access_token_expires_at: { type: Date, default: null, select: false },

    // Bank Details
    bank_name: { type: String, trim: true },
    account_number: { type: String, trim: true },
    ifsc_code: { type: String, trim: true },
    branch_name: { type: String, trim: true },

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
    deleted: { type: Boolean, default: false },
    deleted_at: { type: Date, default: null },
    deleted_by: {
      user_id: { type: Schema.Types.ObjectId, ref: "User", default: null },
      username: { type: String, default: "" },
      name: { type: String, default: "" },
      role: { type: String, default: "" },
    },
  },
  { timestamps: true }
);

EmployeeSchema.index(
  { client: 1, employee_id: 1 },
  {
    unique: true,
    partialFilterExpression: { employee_id: { $exists: true, $gt: "" } },
  }
);

EmployeeSchema.index(
  { client: 1, username: 1 },
  { unique: true, partialFilterExpression: { username: { $type: "string" } } }
);

export default mongoose.model<IEmployee>("Employee", EmployeeSchema, "employees");
