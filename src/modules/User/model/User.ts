import mongoose, { Schema, Document } from 'mongoose';
import bcrypt from 'bcryptjs';
import { ENUM_ROLE, ENUM_USER_TYPES } from '../../../enums/userEnums';
import { allowedEmailValidator } from '../../../utils/emailValidation';

export interface IService {
    label: string;
    value: string;
    role: string;
    active: boolean;
}

export interface IClient {
    account_name: string;
    services: IService[];
}

export interface IUser extends Document {
    name: string;
    dob: string;
    email: string;
    designation: string;
    reporting_manager: string;
    country: string;
    phone_number: string;
    username: string;
    userRole: string;
    password: string;
    language: string;
    userType: string;
    status: number;
    deleted: boolean;
    deleted_at?: Date | null;
    deleted_by?: {
        user_id?: mongoose.Types.ObjectId;
        username?: string;
        name?: string;
        role?: string;
    };
    clients: IClient[];
    outlets: string[];
    profile_pic: string;
    employee_id: string;
    service_type: string;
    custom_fields: { label: string; value: string }[];
    comparePassword(candidatePassword: string): Promise<boolean>;
}

const ServiceSchema: Schema = new Schema({
    label: { type: String, required: true },
    value: { type: String, required: true },
    role: { type: String, default: "" },
    active: { type: Boolean, default: false }
}, { _id: false });

const ClientSchema: Schema = new Schema({
    account_name: { type: String, required: true },
    services: { type: [ServiceSchema], default: [] }
}, { _id: false });

const UserSchema: Schema = new Schema({
    name: { type: String, required: true, trim: true },
    dob: { type: String, required: false, trim: true },
    email: { type: String, trim: true, validate: allowedEmailValidator },
    designation: { type: String, trim: false },
    reporting_manager: { type: String, trim: true },
    country: { type: String, trim: true },
    phone_number: { type: String, trim: true },
    username: { type: String, trim: true, lowercase: true },
    userRole: {
        type: String,
        enum: Object.values(ENUM_ROLE),
        required: true,
        trim: true
    },
    password: { type: String, trim: true },
    language: { type: String, trim: true },
    userType: {
        type: String,
        enum: Object.values(ENUM_USER_TYPES),
        default: ENUM_USER_TYPES.CLIENT,
        trim: true
    },
    status: { type: Number, default: 0 }, // 0 = Active, 1 = Inactive
    deleted: { type: Boolean, default: false },
    deleted_at: { type: Date, default: null },
    deleted_by: {
        user_id: { type: Schema.Types.ObjectId, ref: "User", default: null },
        username: { type: String, default: "" },
        name: { type: String, default: "" },
        role: { type: String, default: "" },
    },
    clients: { type: [ClientSchema], default: [] },
    outlets: { type: [String], default: [] },
    profile_pic: { type: String, trim: true, default: "" },
    employee_id: { type: String, trim: true, default: "" },
    service_type: { type: String, trim: true, default: "" },
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
}, { timestamps: true });

// Hash password before saving
UserSchema.pre<IUser>('save', async function (next) {
    if (!this.isModified('password')) {
        return next();
    }
    // Only hash if password exists (since it's not strictly required in schema anymore, but critical if present)
    if (this.password) {
        const salt = await bcrypt.genSalt(10);
        this.password = await bcrypt.hash(this.password, salt);
    }
    next();
});

// Compare password method
UserSchema.methods.comparePassword = async function (candidatePassword: string): Promise<boolean> {
    if (!this.password) return false;
    return await bcrypt.compare(candidatePassword, this.password);
};

export default mongoose.model<IUser>('User', UserSchema);
