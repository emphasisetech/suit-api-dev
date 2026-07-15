import mongoose, { Schema } from "mongoose";

const PortalChatMessageSchema = new Schema({
  client: { type: String, required: true, index: true },
  conversation_key: { type: String, required: true, index: true },
  sender_kind: { type: String, enum: ["staff", "student", "parent"], required: true },
  sender_id: { type: Schema.Types.ObjectId, required: true, index: true },
  recipient_kind: { type: String, enum: ["staff", "student", "parent"], required: true },
  recipient_id: { type: Schema.Types.ObjectId, required: true, index: true },
  message: { type: String, required: true, trim: true, maxlength: 4000 },
  read_at: { type: Date, default: null },
}, { timestamps: true });

PortalChatMessageSchema.index({ conversation_key: 1, createdAt: 1 });

export default mongoose.models.PortalChatMessage || mongoose.model("PortalChatMessage", PortalChatMessageSchema);
