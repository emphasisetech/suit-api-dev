import mongoose, { Schema, Document } from "mongoose";
import { PaymentFrequency } from "../../../enums/studentEnums";

export interface IMembershipType extends Document {
  client: string;
  membership_type: string;
  fee: number;
  fee_ferquency: PaymentFrequency;
  duration: string;
  registration_required: boolean;
  registration_fee: number;
  status: number;
  deleted: boolean;
  deleted_at?: Date | null;
  deleted_by?: {
    user_id?: mongoose.Types.ObjectId;
    username?: string;
    name?: string;
    role?: string;
  };
}

const MembershipTypeSchema = new Schema(
  {
    client: { type: String, required: true, trim: true },
    membership_type: { type: String, required: true, trim: true },
    fee: { type: Number, default: 0 },
    fee_ferquency: {
      type: String,
      enum: Object.values(PaymentFrequency),
      default: PaymentFrequency.MONTHLY,
      trim: true,
    },
    duration: { type: String, default: "", trim: true },
    registration_required: { type: Boolean, default: false },
    registration_fee: { type: Number, default: 0 },
    status: { type: Number, default: 1 },
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

MembershipTypeSchema.index({ client: 1, membership_type: 1 }, { unique: true });

export default mongoose.model<IMembershipType>("MembershipType", MembershipTypeSchema);
