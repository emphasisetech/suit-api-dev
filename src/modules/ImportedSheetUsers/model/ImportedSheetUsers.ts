import mongoose, { Schema, Document } from 'mongoose';
import { ENUM_STATUS } from '../../../enums/statusEnum';

export interface IImportedSheetUsers extends Document {
    client: string;
    file_name: string;
    username: string;
    current_status: string;
    total_users: number;
    users: any[];
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

const ImportedSheetUsersSchema: Schema = new Schema({
    client: { type: String, default: "" },
    file_name: { type: String, default: "" },
    username: { type: String, default: "" },
    current_status: {
        type: String,
        default: ENUM_STATUS.PENDING,
        enum: [
            ENUM_STATUS.PENDING,
            ENUM_STATUS.FINISHED_SUCCESSFULLY,
            ENUM_STATUS.FAILED,
        ],
    },
    total_users: { type: Number, default: 0 },
    users: { type: [], default: [] },
    deleted: { type: Boolean, default: false },
    deleted_at: { type: Date, default: null },
    deleted_by: {
        user_id: { type: Schema.Types.ObjectId, ref: "User", default: null },
        username: { type: String, default: "" },
        name: { type: String, default: "" },
        role: { type: String, default: "" },
    },
}, { timestamps: true });

export default mongoose.model<IImportedSheetUsers>('ImportedSheetUsers', ImportedSheetUsersSchema);
