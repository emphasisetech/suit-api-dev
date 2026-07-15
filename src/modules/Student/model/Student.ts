import mongoose, { Schema, Document } from "mongoose";
import {
  ProductStatus,
  PaymentStatus,
  CourseStatus,
  PaymentFrequency,
} from "../../../enums/studentEnums";
import { allowedEmailValidator } from "../../../utils/emailValidation";

export interface IPayment {
  _id?: string;
  payment_mode: string;
  remarks: string;
  payment_date: string;
  slip_number: string;
  payment_status: PaymentStatus;
  payment_amount: number;
  deleted?: boolean;
  deleted_at?: Date | null;
  deleted_by?: {
    user_id?: mongoose.Types.ObjectId;
    username?: string;
    name?: string;
    role?: string;
  };
}

export interface ICourse {
  _id?: string; // Mongoose subdoc ID
  course_fee: number;
  total_course_fee: number;
  course_name: string;
  course_type: string;
  selected_subject_count: string;
  fee_ferquency: string;
  course_duration: string;
  course_desc: string;
  course_start_date: string;
  course_end_date: string;
  course_status: CourseStatus;
  registration_required: boolean;
  registration_fee: number;
  payments: IPayment[];
  pending_fee: number;
  pending_fee_till_date: number;
  deleted?: boolean;
  deleted_at?: Date | null;
  deleted_by?: {
    user_id?: mongoose.Types.ObjectId;
    username?: string;
    name?: string;
    role?: string;
  };
  createdAt?: Date; // Mongoose timestamp
}

export interface IStudent extends Document {
  aadhar_number: string;
  student_key: string;
  username?: string;
  password?: string;
  name: string;
  fathers_name: string;
  mothers_name: string;
  email: string;
  email_verified: boolean;
  email_verified_at?: Date | null;
  email_verification_token_hash?: string;
  email_verification_expires_at?: Date | null;
  email_verification_sent_at?: Date | null;
  result_otp_hash?: string;
  result_otp_expires_at?: Date | null;
  result_otp_sent_at?: Date | null;
  portal_otp_hash?: string;
  portal_otp_expires_at?: Date | null;
  portal_access_token_hash?: string;
  portal_access_token_expires_at?: Date | null;
  phone_number: string;
  whatsapp_number: string;
  image_url: string;
  dob: any;
  client: string;
  class_batch: string;
  status: ProductStatus;
  courses: ICourse[];
  custom_field: { label: string; value: string }[];
  custom_fields: { label: string; value: string }[];
  total_pending_fee: number;
  total_pending_fee_till_date: number;
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

const PaymentSchema: Schema = new Schema(
  {
    payment_mode: { type: String, required: true, trim: true },
    remarks: { type: String, required: false, trim: true },
    payment_date: { type: String, required: false, trim: true },
    slip_number: {
      type: String,
      required: true,
      trim: true,
      unique: true,
      sparse: true,
    },
    payment_status: {
      type: String,
      enum: Object.values(PaymentStatus),
      default: PaymentStatus.PAID,
    },
    payment_amount: { type: Number, required: true },
    deleted: { type: Boolean, default: false },
    deleted_at: { type: Date, default: null },
    deleted_by: {
      user_id: { type: Schema.Types.ObjectId, ref: "User", default: null },
      username: { type: String, default: "" },
      name: { type: String, default: "" },
      role: { type: String, default: "" },
    },
  },
  { timestamps: true },
);

const CourseSchema: Schema = new Schema(
  {
    course_fee: { type: Number, required: true },
    total_course_fee: { type: Number, required: false, default: 0 },
    course_name: { type: String, required: true, trim: true },
    course_type: { type: String, enum: ['class', 'professional'], default: 'class' },
    selected_subject_count: { type: String, default: 'all-sub', trim: true },
    fee_ferquency: {
      type: String,
      enum: Object.values(PaymentFrequency),
      default: PaymentFrequency.MONTHLY,
      required: false,
      trim: true,
    },
    course_duration: { type: String, required: false, trim: true },
    course_desc: { type: String, required: false, trim: true },
    course_start_date: { type: String, required: false, trim: true },
    course_end_date: { type: String, required: false, trim: true },
    course_status: {
      type: Number,
      enum: Object.values(CourseStatus).filter((v) => typeof v === "number"),
      default: CourseStatus.ACTIVE,
    },
    registration_required: { type: Boolean, default: false },
    registration_fee: { type: Number, default: 0 },
    payments: { type: [PaymentSchema], default: [] },
    pending_fee: { type: Number, default: 0 },
    pending_fee_till_date: { type: Number, default: 0 },
    deleted: { type: Boolean, default: false },
    deleted_at: { type: Date, default: null },
    deleted_by: {
      user_id: { type: Schema.Types.ObjectId, ref: "User", default: null },
      username: { type: String, default: "" },
      name: { type: String, default: "" },
      role: { type: String, default: "" },
    },
  },
  { timestamps: true },
);

const StudentSchema: Schema = new Schema(
  {
    aadhar_number: { type: String, required: false, trim: true },
    student_key: { type: String, required: false, trim: true },
    username: { type: String, trim: true, lowercase: true, default: undefined },
    password: { type: String, select: false, default: undefined },
    name: { type: String, required: true, trim: true },
    fathers_name: { type: String, required: false, trim: true },
    mothers_name: { type: String, required: false, trim: true },
    email: { type: String, required: false, trim: true, validate: allowedEmailValidator },
    email_verified: { type: Boolean, default: false },
    email_verified_at: { type: Date, default: null },
    email_verification_token_hash: { type: String, default: "", select: false },
    email_verification_expires_at: { type: Date, default: null, select: false },
    email_verification_sent_at: { type: Date, default: null },
    result_otp_hash: { type: String, default: "", select: false },
    result_otp_expires_at: { type: Date, default: null, select: false },
    result_otp_sent_at: { type: Date, default: null },
    portal_otp_hash: { type: String, default: "", select: false },
    portal_otp_expires_at: { type: Date, default: null, select: false },
    portal_access_token_hash: { type: String, default: "", select: false },
    portal_access_token_expires_at: { type: Date, default: null, select: false },
    phone_number: { type: String, required: false, trim: true },
    whatsapp_number: { type: String, required: false, trim: true },
    image_url: { type: String, required: false, trim: true, default: "" },
    dob: { type: String, required: false, trim: true },
    client: { type: String, required: true, trim: true },
    class_batch: { type: String, required: false, trim: true },
    status: {
      type: Number,
      enum: Object.values(ProductStatus).filter((v) => typeof v === "number"),
      default: ProductStatus.ACTIVE,
    },
    courses: { type: [CourseSchema], default: [] },
    custom_field: {
      type: [
        {
          label: String,
          value: String,
          _id: false,
        },
      ],
      default: [],
    },
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
    total_pending_fee: { type: Number, default: 0 },
    total_pending_fee_till_date: { type: Number, default: 0 },
    deleted: { type: Boolean, default: false },
    deleted_at: { type: Date, default: null },
    deleted_by: {
      user_id: { type: Schema.Types.ObjectId, ref: "User", default: null },
      username: { type: String, default: "" },
      name: { type: String, default: "" },
      role: { type: String, default: "" },
    },
  },
  { timestamps: true },
);

StudentSchema.index(
  { client: 1, student_key: 1 },
  {
    unique: true,
    partialFilterExpression: {
      student_key: { $exists: true, $type: "string", $ne: "" },
      deleted: { $ne: true },
    },
  },
);

StudentSchema.index({ client: 1, username: 1 }, { unique: true, partialFilterExpression: { username: { $type: "string" } } });

const StudentModel = mongoose.model<IStudent>("Student", StudentSchema);

StudentModel.collection
  .dropIndex("student_key_1")
  .catch((error: any) => {
    if (error?.codeName !== "IndexNotFound") {
      console.warn("Unable to drop obsolete student_key index:", error?.message || error);
    }
  });

export default StudentModel;
