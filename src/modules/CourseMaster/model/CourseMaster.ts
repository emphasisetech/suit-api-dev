import mongoose, { Schema, Document } from 'mongoose';

export interface ICourse {
    _id?: string;
    course_name: string;
    course_type: string;
    fee: number;
    subject_fee_options: {
        subject_count: string;
        fee: number;
    }[];
    is_certificate: boolean;
    order: number;
    registration_required: boolean;
    registration_fee: number;
    status: boolean;
    deleted: boolean;
    deleted_at?: Date | null;
    deleted_by?: {
        user_id?: mongoose.Types.ObjectId;
        username?: string;
        name?: string;
        role?: string;
    };
}

export interface ICourseMaster extends Document {
    client: string;
    courses: ICourse[];
}

const CourseSchema = new Schema({
    course_name: { type: String, required: true },
    course_type: { type: String, enum: ['class', 'professional'], default: 'class' },
    fee: { type: Number, required: true },
    subject_fee_options: {
        type: [{
            subject_count: { type: String, required: true },
            fee: { type: Number, required: true },
            _id: false
        }],
        default: []
    },
    is_certificate: { type: Boolean, default: false },
    registration_required: { type: Boolean, default: false },
    registration_fee: { type: Number, default: 0 },
    order: { type: Number, required: true, default: 0 },
    status: { type: Boolean, default: true },
    deleted: { type: Boolean, default: false },
    deleted_at: { type: Date, default: null },
    deleted_by: {
        user_id: { type: Schema.Types.ObjectId, ref: "User", default: null },
        username: { type: String, default: "" },
        name: { type: String, default: "" },
        role: { type: String, default: "" },
    },
});

const CourseMasterSchema: Schema = new Schema({
    client: { type: String, required: true },
    courses: { type: [CourseSchema], default: [] }
}, { timestamps: true });

export default mongoose.model<ICourseMaster>('master_courses', CourseMasterSchema);
