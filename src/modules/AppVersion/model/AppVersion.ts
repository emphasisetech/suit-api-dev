import mongoose, { Document, Schema } from 'mongoose';

export interface IAppVersion extends Document {
    platform: string;
    latestVersion: string;
    downloadPath: string;
    downloadUrl?: string;
    fileName: string;
    gridFsFileId?: mongoose.Types.ObjectId;
    forceUpdate: boolean;
    uploadedAt: Date;
}

const AppVersionSchema: Schema = new Schema(
    {
        platform: { type: String, default: 'android', unique: true, index: true },
        latestVersion: { type: String, required: true },
        downloadPath: { type: String, required: true },
        downloadUrl: { type: String, default: '' },
        fileName: { type: String, required: true },
        gridFsFileId: { type: Schema.Types.ObjectId, default: null },
        forceUpdate: { type: Boolean, default: false },
        uploadedAt: { type: Date, default: Date.now },
    },
    { timestamps: true },
);

export default mongoose.model<IAppVersion>('AppVersion', AppVersionSchema);
