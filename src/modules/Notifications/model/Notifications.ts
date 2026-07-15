import mongoose, { Schema, Document } from 'mongoose';

export interface INotifications extends Document {
    msg: string;
    username: string;
    to: string;
    from_user_role: string;
    for_super_admin: boolean;
    page_url: string;
    read: boolean;
    status: number; // 0-active, 1-inactive
    seenAt: Date;
    createdAt: Date;
    updatedAt: Date;
}

const NotificationsSchema: Schema = new Schema({
    msg: { type: String, required: true },
    username: { type: String },
    to: { type: String },
    from_user_role: { type: String },
    for_super_admin: { type: Boolean, required: true, default: false },
    page_url: { type: String, trim: true },
    read: { type: Boolean, required: true, default: false },
    status: { type: Number, required: false, default: 0, enum: [0, 1] },
    seenAt: { type: Date }
}, { timestamps: true });

export default mongoose.model<INotifications>('Notifications', NotificationsSchema);

