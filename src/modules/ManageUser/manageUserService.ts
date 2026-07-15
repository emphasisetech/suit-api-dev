import User from '../User/model/User';
import Account from '../Account/model/Account';
import { ENUM_USER_TYPES } from '../../enums/userEnums';
import { ENUM_STATUS } from '../../enums/statusEnum';
import { MESSAGES } from '../../constants/messages';
// import { FileUploadService } from './fileUploadService'; // TODO: Implement FileUploadService
import ImportedSheetUsers from '../ImportedSheetUsers/model/ImportedSheetUsers';
import { assertAllowedEmail } from '../../utils/emailValidation';
import { activeRecordFilter, getSoftDeleteUpdate } from '../../utils/softDelete';

export class ManageUserService {
    private normalizeUsername(value: any) {
        return String(value || "").trim().toLowerCase();
    }

    private exactUsernameQuery(value: any) {
        const escaped = this.normalizeUsername(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        return { $regex: new RegExp(`^${escaped}$`, "i") };
    }

    private async normalizeOutletAssignments(userDto: any) {
        const accountKey = String(userDto?.clients?.[0]?.account_name || "").trim();
        if (!accountKey) return [];

        if (String(userDto.userRole || "").toLowerCase() === "head_office") {
            return [];
        }

        const account: any = await Account.findOne({
            account_key: { $regex: new RegExp(`^${accountKey}$`, "i") },
        }).lean();
        if (!account) throw new Error("Account not found");

        const validOutletKeys = new Set<string>(
            [
                account.account_key,
                ...(account.outlets || []).map((outlet: any) => outlet.outlet_key),
            ].map((key: string) => String(key).toLowerCase())
        );
        const requested: string[] = Array.isArray(userDto.outlets)
            ? userDto.outlets.map((key: any) => String(key).toLowerCase())
            : [];
        const normalized = [...new Set(requested)].filter((key) =>
            validOutletKeys.has(key)
        );

        if (!normalized.length) {
            throw new Error("At least one outlet must be assigned");
        }
        return normalized;
    }

    // constructor(private readonly fileUploadService: FileUploadService) {}

    /**
     * Function to create user
     * @param createDto
     * @returns
     */
    async create(createDto: any, payload: any = {}) {
        assertAllowedEmail(createDto.email);
        const userRole = payload?.userRole?.toLowerCase();
        if (userRole === "user") {
            throw new Error("User role not authorized to create users");
        }
        if (userRole === "account_managers") {
            const targetRole = createDto.userRole?.toLowerCase();
            if (targetRole === "superadmin" || targetRole === "account_managers") {
                throw new Error("Account manager not authorized to create Super Admin or other Account Managers");
            }
        }
        try {
            createDto.username = this.normalizeUsername(createDto.username);
            createDto.outlets = await this.normalizeOutletAssignments(createDto);
            // Check for existing user
            const existingDealer = await User.findOne({
                username: this.exactUsernameQuery(createDto.username),
                ...activeRecordFilter,
            });

            if (existingDealer) {
                throw { code: 409, message: MESSAGES.DUPLICATE_USER };
            }

            const accountDetails: any = await Account.findOne({
                account_key: {
                    // Changed from account_key to account_name to match update method
                    $regex: new RegExp(`^${createDto.clients[0].account_name}$`, "i"),
                },
            }).lean();

            const checkObj: any = {};
            accountDetails?.services?.forEach((service: any) => {
                checkObj[service.value] = service.user;
            });

            // Get count of active services for the SAME ACCOUNT
            const input = await User.aggregate([
                {
                    $match: {
                        "clients.account_name": {
                            $regex: new RegExp(`^${createDto.clients[0].account_name}$`, "i"),
                        },
                    },
                },
                {
                    $unwind: "$clients",
                },
                {
                    $match: {
                        "clients0.account_name": {
                            $regex: new RegExp(`^${createDto.clients[0].account_name}$`, "i"),
                        },
                    },
                },
                {
                    $unwind: "$clients.services",
                },
                {
                    $match: {
                        "clients.services.active": true,
                    },
                },
                {
                    $group: {
                        _id: "$clients.services.value",
                        count: { $sum: 1 },
                    },
                },
                {
                    $project: {
                        _id: 0,
                        value: "$_id",
                        count: 1,
                    },
                },
            ]);

            const availableData: any = {};
            input.forEach((item: any) => {
                availableData[item.value] = item.count;
            });

            // Count the services that will be active for this NEW user
            const servicesToBeActive = createDto.clients[0].services
                .filter((service: any) => service.active)
                .map((service: any) => service.value);

            // Check each service limit for the specific account
            for (const service of createDto.clients[0].services) {
                if (service.active) {
                    const currentTotalCount = availableData[service.value] || 0;
                    const allowedLimit = checkObj[service.value] || 0;

                    const effectiveCountAfterCreate = currentTotalCount + 1;

                    if (effectiveCountAfterCreate > allowedLimit) {
                        throw { status: 400, message: `User Limit Reached for service ${service.value}` };
                    }
                }
            }

            const result = await User.create({
                ...createDto,
                userType: ENUM_USER_TYPES.CLIENT,
            });

            // Sync custom field labels to Account
            if (createDto.custom_fields && createDto.custom_fields.length > 0) {
                await this.syncCustomFieldLabels(createDto.clients[0].account_name, createDto.custom_fields);
            }

            return result;
        } catch (error) {
            throw error;
        }
    }

    /**
     * Function to find all users
     * @returns
     */
    async findAll(
        client: string = "",
        search: string = "",
        pageNum: number = 1,
        count: number = 10,
        channelData?: any,
        payload: any = {}
    ) {
        const userRole = payload?.userRole?.toLowerCase();
        if (userRole === "user") {
            throw new Error("User role not authorized to view user details");
        }

        try {
            const filterQuery: any = {
                deleted: { $ne: true },
                userType: {
                    $regex: `^${ENUM_USER_TYPES.CLIENT}$`,
                    $options: "i",
                }
            };

            if (userRole !== "superadmin") {
                // Exclude superadmin users from results for everyone else
                filterQuery.userRole = { $ne: "superadmin" };
            }

            if (userRole === "head_office") {
                // Head Office can only see users of their account
                const userClientNames = payload.clients?.map((c: any) => c.account_name.toLowerCase()) || [];
                if (client) {
                    if (!userClientNames.includes(client.toLowerCase())) {
                        throw new Error("Not authorized to view users for this account");
                    }
                } else {
                    filterQuery["clients.account_name"] = { $in: userClientNames };
                }
            }

            if (client) {
                filterQuery["clients.account_name"] = {
                    $regex: `^${client}$`,
                    $options: "i",
                };
            }


            // Channel filtering logic - simplified for express/mongoose context where we might not have the full payload structure yet
            if (client && channelData) {
                let channelArray: string[] = [];
                // Assuming channelData is passed directly as array or string
                if (Array.isArray(channelData)) {
                    channelArray = channelData;
                } else if (typeof channelData === 'string') {
                    channelArray = channelData.split(',').map(s => s.trim());
                }

                if (channelArray.length > 0) {
                    filterQuery["channel"] = { $in: channelArray };
                }
            }

            if (search) {
                filterQuery.$or = [
                    { name: { $regex: search, $options: "i" } },
                    { username: { $regex: search, $options: "i" } },
                    { email: { $regex: search, $options: "i" } },
                ];
            }

            const result = await User.find(filterQuery)
                .skip((pageNum - 1) * count)
                .limit(count)
                .lean();

            return result;
        } catch (error) {
            throw error;
        }
    }

    /**
     * Function to find user by username
     * @param username
     * @returns
     */
    async findOne(username: string) {
        try {
            const users = await User.findOne({
                username: this.exactUsernameQuery(username),
                ...activeRecordFilter,
            });
            return users;
        } catch (error) {
            throw error;
        }
    }

    /**
     * Function to update user
     * @param username
     * @param updateDto
     * @returns
     */
    async update(username: string, updateDto: any, payload: any = {}) {
        assertAllowedEmail(updateDto.email);
        const userRole = payload?.userRole?.toLowerCase();
        if (userRole === "user") {
            throw new Error("User role not authorized to update users");
        }

        try {
            delete updateDto["_id"];
            updateDto.outlets = await this.normalizeOutletAssignments(updateDto);

            const currentUser = await User.findOne({
                username: this.exactUsernameQuery(username),
                ...activeRecordFilter,
            }).lean();

            if (!currentUser) throw { status: 404, message: MESSAGES.MANAGE_USER.RETRIEVED };

            if (updateDto.username) {
                updateDto.username = this.normalizeUsername(updateDto.username);
                const duplicateUser = await User.findOne({
                    _id: { $ne: currentUser._id },
                    username: this.exactUsernameQuery(updateDto.username),
                    ...activeRecordFilter,
                }).lean();
                if (duplicateUser) throw { code: 409, message: MESSAGES.DUPLICATE_USER };
            }

            if (userRole === "account_managers") {
                const targetRole = currentUser.userRole?.toLowerCase();
                if (targetRole === "superadmin" || targetRole === "account_managers") {
                    throw new Error("Account manager not authorized to manage Super Admin or other Account Managers");
                }
            }

            if (userRole === "head_office") {
                const userClientNames = payload.clients?.map((c: any) => c.account_name.toLowerCase()) || [];
                const targetClientNames = currentUser.clients?.map((c) => c.account_name.toLowerCase()) || [];
                const hasAccess = targetClientNames.some(name => userClientNames.includes(name));
                if (!hasAccess) {
                    throw new Error("Head office not authorized to manage users of other accounts");
                }
            }

            const accountDetails: any = await Account.findOne({
                account_key: {
                    $regex: new RegExp(`^${updateDto.clients[0].account_name}$`, "i"),
                },
            }).lean();

            const checkObj: any = {};
            accountDetails?.services?.forEach((service: any) => {
                checkObj[service.value] = service.user;
            });

            // Get count of active services
            const input = await User.aggregate([
                {
                    $match: {
                        "clients.account_name": {
                            $regex: new RegExp(`^${updateDto.clients[0].account_name}$`, "i"),
                        },
                    },
                },
                {
                    $unwind: "$clients",
                },
                {
                    $match: {
                        "clients.account_name": {
                            $regex: new RegExp(`^${updateDto.clients[0].account_name}$`, "i"),
                        },
                    },
                },
                {
                    $unwind: "$clients.services",
                },
                {
                    $match: {
                        "clients.services.active": true,
                    },
                },
                {
                    $group: {
                        _id: "$clients.services.value",
                        count: { $sum: 1 },
                    },
                },
                {
                    $project: {
                        _id: 0,
                        value: "$_id",
                        count: 1,
                    },
                },
            ]);

            const availableData: any = {};
            input.forEach((item: any) => {
                availableData[item.value] = item.count;
            });

            const currentUserAccount = currentUser?.clients?.find(
                (client) =>
                    client.account_name?.toLowerCase() ===
                    updateDto.clients[0].account_name.toLowerCase()
            );

            const currentActiveServices =
                currentUserAccount?.services
                    ?.filter((service) => service.active)
                    ?.map((service) => service.value) || [];

            for (const service of updateDto.clients[0].services) {
                if (service.active) {
                    const currentTotalCount = availableData[service.value] || 0;
                    const allowedLimit = checkObj[service.value] || 0;

                    const isCurrentlyActive = currentActiveServices.includes(service.value);
                    const effectiveCountAfterUpdate = isCurrentlyActive
                        ? currentTotalCount
                        : currentTotalCount + 1;

                    if (effectiveCountAfterUpdate > allowedLimit) {
                        throw { status: 400, message: `User Limit Reached for service ${service.value}` };
                    }
                }
            }

            const result = await User.findOneAndUpdate(
                { username: this.exactUsernameQuery(username), ...activeRecordFilter },
                { $set: { ...updateDto } },
                { new: true }
            );

            // Sync custom field labels to Account
            if (updateDto.custom_fields && updateDto.custom_fields.length > 0) {
                await this.syncCustomFieldLabels(updateDto.clients[0].account_name, updateDto.custom_fields);
            }

            return result;
        } catch (error) {
            throw error;
        }
    }

    async updateProfilePic(username: string, updateDto: any) {
        try {
            delete updateDto["_id"];

            const result = await User.findOneAndUpdate(
                { username: this.exactUsernameQuery(username), ...activeRecordFilter },
                { $set: { ...updateDto } },
                { new: true }
            );

            if (!result) {
                throw { status: 404, message: "User not found" };
            }

            return result;
        } catch (error) {
            throw error;
        }
    }

    async remove(username: string, payload: any = {}) {
        const userRole = payload?.userRole?.toLowerCase();
        if (userRole === "user") {
            throw new Error("User role not authorized to delete users");
        }

        try {
            const targetUser = await User.findOne({
                username: this.exactUsernameQuery(username),
                ...activeRecordFilter,
            }).lean();

            if (!targetUser) throw new Error("User not found");

            if (userRole === "account_managers") {
                const targetRole = targetUser.userRole?.toLowerCase();
                if (targetRole === "superadmin" || targetRole === "account_managers") {
                    throw new Error("Account manager not authorized to delete Super Admin or other Account Managers");
                }
            }

            if (userRole === "head_office") {
                const userClientNames = payload.clients?.map((c: any) => c.account_name.toLowerCase()) || [];
                const targetClientNames = targetUser.clients?.map((c) => c.account_name.toLowerCase()) || [];
                const hasAccess = targetClientNames.some(name => userClientNames.includes(name));
                if (!hasAccess) {
                    throw new Error("Head office not authorized to delete users of other accounts");
                }
            }

            const result = await User.findOneAndUpdate(
                {
                    username: this.exactUsernameQuery(username),
                    deleted: { $ne: true },
                },
                { $set: getSoftDeleteUpdate(payload) },
                { new: true }
            );
            return result;
        } catch (error) {
            throw error;
        }
    }

    async removeProfilePic(username: string, filename: string) {
        try {
            // TODO: Integrate FileUploadService when available
            /*
           if (filename) {
               await this.fileUploadService.delete({ filename: filename });
           }
            */

            const updateDto: any = {
                profile_pic: null,
            };

            const result = await User.findOneAndUpdate(
                { username: this.exactUsernameQuery(username), ...activeRecordFilter },
                { $set: updateDto },
                { new: true }
            );

            if (!result) {
                throw { status: 404, message: "User not found" };
            }

            // TODO: Integrate FileUploadService
            /*
           if (result.profile_pic) {
               await this.fileUploadService.delete({ filename: result.profile_pic });
           }
           */

            return result;
        } catch (error) {
            throw error;
        }
    }

    async importUsersInDatabase(bodyData: any) {
        try {
            const result = await ImportedSheetUsers.create({
                client: bodyData.client,
                file_name: bodyData.file_name,
                current_status: ENUM_STATUS.PENDING,
                total_users: bodyData.users.length,
                users: [],
            });

            const processedUsers = [];
            let processedCount = 0;

            for (const user of bodyData.users) {
                processedCount++;
                const userResult = { ...user, import_status: ENUM_STATUS.PENDING, failure_reason: "" };

                try {
                    user.username = this.normalizeUsername(user.username);
                    assertAllowedEmail(user.email);
                    const existingUser = await User.findOne({
                        username: this.exactUsernameQuery(user.username),
                        ...activeRecordFilter,
                    });

                    if (existingUser) {
                        userResult.import_status = ENUM_STATUS.SKIPPED;
                        userResult.failure_reason = "Duplicate username";
                        processedUsers.push(userResult);
                        continue;
                    }

                    const processedUser = { ...user };
                    if (user.services && typeof user.services === 'string') {
                        const servicesList = user.services.split(',').map((s: string) => {
                            const match = s.trim().match(/^(.+?)\s*\((.+?)\)$/);
                            if (match) {
                                return {
                                    label: match[1].trim(),
                                    value: match[1].trim(),
                                    role: match[2].trim(),
                                    active: true
                                };
                            }
                            return {
                                label: s.trim(),
                                value: s.trim(),
                                role: "",
                                active: true
                            };
                        });

                        processedUser.clients = [{
                            account_name: bodyData.client,
                            services: servicesList
                        }];
                        delete processedUser.services;
                    }

                    await User.create({
                        ...processedUser,
                        userType: ENUM_USER_TYPES.CLIENT,
                    });

                    userResult.import_status = ENUM_STATUS.FINISHED_SUCCESSFULLY;
                    processedUsers.push(userResult);

                } catch (err: any) {
                    userResult.import_status = ENUM_STATUS.SKIPPED;
                    userResult.failure_reason = err.message || "Unknown error";
                    processedUsers.push(userResult);
                }
            }

            const finalStatus = processedUsers.some(u => u.import_status === ENUM_STATUS.SKIPPED)
                ? ENUM_STATUS.FINISHED_SUCCESSFULLY
                : ENUM_STATUS.FINISHED_SUCCESSFULLY;

            const finalResult = await ImportedSheetUsers.findByIdAndUpdate(
                result._id,
                {
                    $set: {
                        users: processedUsers,
                        current_status: finalStatus
                    }
                },
                { new: true }
            );

            return finalResult;

        } catch (error) {
            throw error;
        }
    }

    private async syncCustomFieldLabels(client: string, customFields: { label: string }[]) {
        if (!client || !customFields || customFields.length === 0) return;
        const labels = customFields.map(f => f.label);
        await Account.findOneAndUpdate(
            { $or: [{ account_name: client }, { account_key: client }] },
            { $addToSet: { custom_user_fields: { $each: labels } } }
        );
    }
}
