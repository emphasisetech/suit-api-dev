import mongoose, { Document, Schema } from "mongoose";

export enum HelpSupportType {
  BUG = "bug",
  CHANGE_SUGGESTION = "change_suggestion",
  NEW_FEATURE = "new_feature",
}

export enum HelpSupportStatus {
  OPEN = "open",
  IN_PROGRESS = "in_progress",
  RESOLVED = "resolved",
  CLOSED = "closed",
}

export interface IHelpSupport extends Document {
  type: HelpSupportType;
  subject: string;
  description: string;
  status: HelpSupportStatus;
  submitted_by: "guest" | "user";
  user_id?: mongoose.Types.ObjectId;
  name?: string;
  email?: string;
  username?: string;
  user_role?: string;
  client?: string;
}

const HelpSupportSchema = new Schema<IHelpSupport>(
  {
    type: {
      type: String,
      enum: Object.values(HelpSupportType),
      required: true,
    },
    subject: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, required: true, trim: true, maxlength: 5000 },
    status: {
      type: String,
      enum: Object.values(HelpSupportStatus),
      default: HelpSupportStatus.OPEN,
    },
    submitted_by: {
      type: String,
      enum: ["guest", "user"],
      default: "guest",
    },
    user_id: { type: Schema.Types.ObjectId, ref: "User" },
    name: { type: String, trim: true },
    email: { type: String, trim: true, lowercase: true },
    username: { type: String, trim: true },
    user_role: { type: String, trim: true },
    client: { type: String, trim: true },
  },
  { timestamps: true },
);

export default mongoose.model<IHelpSupport>("HelpSupport", HelpSupportSchema);
