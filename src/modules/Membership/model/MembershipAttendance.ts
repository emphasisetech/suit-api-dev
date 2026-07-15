import mongoose, { Schema, Document } from "mongoose";

export interface IMembershipAttendanceElement {
  userId: mongoose.Types.ObjectId;
  checkInTime?: Date;
  checkOutTime?: Date;
}

export interface IMembershipAttendance extends Document {
  client: string;
  memberId: mongoose.Types.ObjectId;
  attendacelist: IMembershipAttendanceElement[];
}

const MembershipAttendanceElementSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    checkInTime: { type: Date },
    checkOutTime: { type: Date },
  },
  { _id: false },
);

const MembershipAttendanceSchema = new Schema(
  {
    client: { type: String, required: true },
    memberId: { type: Schema.Types.ObjectId, ref: "Membership", required: true },
    attendacelist: { type: [MembershipAttendanceElementSchema], default: [] },
  },
  { timestamps: true },
);

MembershipAttendanceSchema.index({ memberId: 1, client: 1 });

export default mongoose.model<IMembershipAttendance>("MembershipAttendance", MembershipAttendanceSchema);
