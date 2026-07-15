import mongoose, { Schema, Document } from 'mongoose';
import { allowedEmailValidator } from '../../../utils/emailValidation';

export interface INewsletter extends Document {
  email: string;
  status: number;
  deleted: boolean;
  deleted_at?: Date | null;
  deleted_by?: {
    user_id?: mongoose.Types.ObjectId;
    username?: string;
    name?: string;
    role?: string;
  };
  createdAt: Date;
  updatedAt: Date;
}

const NewsletterSchema: Schema = new Schema({
  email: { type: String, required: true, trim: true, lowercase: true, unique: true, validate: allowedEmailValidator },
  status: { type: Number, enum: [0, 1], default: 1 },
  deleted: { type: Boolean, default: false },
  deleted_at: { type: Date, default: null },
  deleted_by: {
    user_id: { type: Schema.Types.ObjectId, ref: "User", default: null },
    username: { type: String, default: "" },
    name: { type: String, default: "" },
    role: { type: String, default: "" },
  },
}, { timestamps: true });

export default mongoose.model<INewsletter>('Newsletter', NewsletterSchema);
