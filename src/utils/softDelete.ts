import { Types } from "mongoose";

export const activeRecordFilter = { deleted: { $ne: true } };

export const getDeletedBy = (payload: any = {}) => ({
  user_id: payload?._id ? new Types.ObjectId(payload._id) : undefined,
  username: payload?.username || "",
  name: payload?.name || "",
  role: payload?.userRole || payload?.role || "",
});

export const getSoftDeleteUpdate = (payload: any = {}) => ({
  deleted: true,
  deleted_at: new Date(),
  deleted_by: getDeletedBy(payload),
});
