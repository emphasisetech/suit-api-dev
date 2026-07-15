import mongoose, { Schema } from "mongoose";

const ParentSchema = new Schema({
  client: { type: String, required: true, trim: true, index: true },
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, trim: true, lowercase: true },
  phone: { type: String, trim: true, default: "" },
  username: { type: String, required: true, trim: true, lowercase: true },
  password: { type: String, required: true, select: false },
  children: [{ type: Schema.Types.ObjectId, ref: "Student", required: true }],
  status: { type: Number, default: 1 },
  otp_hash: { type: String, default: "", select: false },
  otp_expires_at: { type: Date, default: null, select: false },
  access_token_hash: { type: String, default: "", select: false },
  access_token_expires_at: { type: Date, default: null, select: false },
  deleted: { type: Boolean, default: false },
}, { timestamps: true });

ParentSchema.index({ client: 1, email: 1 }, { unique: true });
ParentSchema.index({ client: 1, username: 1 }, { unique: true });

export default mongoose.models.Parent || mongoose.model("Parent", ParentSchema);
