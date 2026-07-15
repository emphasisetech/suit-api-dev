import mongoose, { Schema, Document } from "mongoose";
import { PaymentStatus } from "../../../enums/studentEnums";
import { allowedEmailValidator } from "../../../utils/emailValidation";

export interface IMembershipPayment {
  payment_mode: string;
  remarks?: string;
  payment_date?: string;
  slip_number: string;
  payment_status: PaymentStatus;
  payment_amount: number;
}

export interface IMembership extends Document {
  name: string;
  phone_number?: string;
  whatsapp_number?: string;
  email?: string;
  client: string;
  membership_type: string;
  membership_fee: number;
  fee_ferquency: string;
  registration_required: boolean;
  registration_fee: number;
  start_date?: string;
  end_date?: string;
  status: number;
  payments: IMembershipPayment[];
  total_paid: number;
  total_pending_fee: number;
  deleted: boolean;
  deleted_at?: Date | null;
  deleted_by?: {
    user_id?: mongoose.Types.ObjectId;
    username?: string;
    name?: string;
    role?: string;
  };
}

const MembershipPaymentSchema = new Schema(
  {
    payment_mode: { type: String, required: true, trim: true },
    remarks: { type: String, default: "", trim: true },
    payment_date: { type: String, default: "", trim: true },
    slip_number: { type: String, required: true, trim: true, unique: true, sparse: true },
    payment_status: {
      type: String,
      enum: Object.values(PaymentStatus),
      default: PaymentStatus.PAID,
    },
    payment_amount: { type: Number, required: true },
  },
  { timestamps: true },
);

const MembershipSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    phone_number: { type: String, default: "", trim: true },
    whatsapp_number: { type: String, default: "", trim: true },
    email: { type: String, default: "", trim: true, validate: allowedEmailValidator },
    client: { type: String, required: true, trim: true },
    membership_type: { type: String, required: true, trim: true },
    membership_fee: { type: Number, default: 0 },
    fee_ferquency: { type: String, default: "Monthly", trim: true },
    registration_required: { type: Boolean, default: false },
    registration_fee: { type: Number, default: 0 },
    start_date: { type: String, default: "", trim: true },
    end_date: { type: String, default: "", trim: true },
    status: { type: Number, default: 1 },
    payments: { type: [MembershipPaymentSchema], default: [] },
    total_paid: { type: Number, default: 0 },
    total_pending_fee: { type: Number, default: 0 },
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

MembershipSchema.index({ client: 1, name: 1 });

export default mongoose.model<IMembership>("Membership", MembershipSchema);
