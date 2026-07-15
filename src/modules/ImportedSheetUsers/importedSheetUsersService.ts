import ImportedSheetUsers from '../ImportedSheetUsers/model/ImportedSheetUsers';
import { MESSAGES } from '../../constants/messages';
import { ENUM_STATUS } from '../../enums/statusEnum';
import { activeRecordFilter, getSoftDeleteUpdate } from '../../utils/softDelete';

export class ImportedSheetUsersService {

    /**
     * Function to create importedSheetUsers
     * @param createDto importedSheetUsers dto
     * @returns
     */
    async create(createDto: any) {
        try {
            const importedUsersSheet = await ImportedSheetUsers.create(createDto);
            return importedUsersSheet;
        } catch (error) {
            throw error;
        }
    }

    /**
     * Function to find all the importedSheetUsers
     * @returns
     */
    async findAll(client: string) {
        try {
            if (!client) {
                throw { status: 400, message: MESSAGES.COMMON.CLIENT_REQUIRED };
            }

            const result = await ImportedSheetUsers.find({ client, ...activeRecordFilter })
                .limit(10)
                .sort({ createdAt: -1 })
                .lean();

            const mappedData = result.map((e: any) => {
                let updatedUserCount = e?.users?.length
                    ? e.users.filter((user: any) => user.import_status != ENUM_STATUS.SKIPPED)
                    : [];

                let failedUserCount = e?.users?.length
                    ? e.users.filter((user: any) => user.import_status == ENUM_STATUS.SKIPPED)
                    : [];

                return {
                    _id: e._id,
                    username: e.username,
                    createdAt: e.createdAt,
                    file_name: e.file_name,
                    updatedUserCount: updatedUserCount.length,
                    failedUserCount: failedUserCount?.length,
                    status: e.current_status || ENUM_STATUS.PENDING,
                };
            });

            return mappedData;
        } catch (error) {
            throw error;
        }
    }

    /**
     * Function to download the importedSheetUsers
     * @returns
     */
    async downloadSheet(sheet_id: string) {
        try {
            if (!sheet_id) {
                throw { status: 400, message: "Sheet ID is required" };
            }

            const result = await ImportedSheetUsers.findOne({ _id: sheet_id, ...activeRecordFilter }).lean();

            if (!result) {
                throw { status: 404, message: "Sheet not found" };
            }

            const finalData = result.users;
            return finalData;
        } catch (error) {
            throw error;
        }
    }

    /**
     * Function to delete the importedSheetUsers
     * @returns
     */
    async deleteSheet(sheet_id: string, payload: any = {}) {
        try {
            const result = await ImportedSheetUsers.findOneAndUpdate(
                { _id: sheet_id, ...activeRecordFilter },
                { $set: getSoftDeleteUpdate(payload) },
                { new: true }
            );
            return result;
        } catch (error) {
            throw error;
        }
    }
}
