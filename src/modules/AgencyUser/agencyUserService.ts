import User, { IUser } from '../User/model/User';
import { ENUM_USER_TYPES } from '../../enums/userEnums';
import { activeRecordFilter, getSoftDeleteUpdate } from '../../utils/softDelete';

export class AgencyUserService {
    private normalizeUsername(value: any) {
        return String(value || "").trim().toLowerCase();
    }

    private exactUsernameQuery(value: any) {
        const escaped = this.normalizeUsername(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        return { $regex: new RegExp(`^${escaped}$`, "i") };
    }

    /**
     * Function to create user
     * @param createDto
     * @returns
     */
    async create(createDto: any): Promise<any> {
        createDto.username = this.normalizeUsername(createDto.username);
        // Check for existing user
        const existingDealer = await User.findOne({
            username: this.exactUsernameQuery(createDto.username),
            ...activeRecordFilter,
        });

        if (existingDealer) {
            throw new Error("ACCOUNTS.DUPLICATE");
        }

        const user = await User.create({
            ...createDto,
            userType: ENUM_USER_TYPES.AGENCY,
        });

        return user;
    }

    /**
     * Function to find all users
     * @returns
     */
    async findAll(
        search: string = "",
        pageNum: number = 1,
        count: number = 10
    ): Promise<any> {
        // Build the exact filter query dynamically
        const filterQuery: any = {
            deleted: { $ne: true },
            userType: ENUM_USER_TYPES.AGENCY,
        };
        // Global search query if provided
        if (search) {
            filterQuery.$or = [
                { name: { $regex: search, $options: "i" } },
                { email: { $regex: search, $options: "i" } },
                { username: { $regex: search, $options: "i" } },
            ];
        }

        // Calculate skip
        const skip = (pageNum - 1) * count;
        console.log(filterQuery, "filterQuery");

        // Fetch data with filtering, search, and sorting
        const result = await User.find(filterQuery)
            .skip(skip)
            .limit(count)
            .lean();
        console.log(result, "result");
        const total = await User.countDocuments(filterQuery);

        return { result, total, pageNum, count };
    }

    /**
     * Function to find user by userId
     * @param userId
     * @returns
     */
    async findOne(userId: string) {
        // Adapt: Check if input is a valid ObjectId, otherwise treat as username if needed, 
        // but the method name implies ID or specific identifier. 
        // The original NestJS code had findOne by 'username' param but used findById in logic? 
        // Let's re-read the snippet. 
        // user snippet: async findOne(@Param("username") username: string) { return await this.agencyUserService.findOne(username); }
        // service snippet: async findOne(userId: string) { const users = await this.usersModel.findById(userId); ... }
        // It seems there was a mismatch in the user's snippet (param name 'username' vs logic 'findById').
        // I will assume it means search by username based on the route parameter.

        // Wait, the router said Get(":username"), so it passes a username string.
        // But the service logic used findById. 
        // I should probably support finding by username here to match the route parameter meaning.

        const user = await User.findOne({ _id: userId, ...activeRecordFilter }, { password: 0 });
        return user;
    }

    /**
     * Function to find user by username
     * @param username
     * @returns
     */
    async findUserByUserName(username: string) {
        const user = await User.findOne({
            username: this.exactUsernameQuery(username),
            ...activeRecordFilter,
        });
        return user;
    }

    /**
     * Function to update user
     * @param username
     * @param updateAgencyUserDto
     * @returns
     */
    async update(username: string, updateAgencyUserDto: any) {
        if (updateAgencyUserDto["_id"]) {
            delete updateAgencyUserDto["_id"];
        }

        const user = await User.findOne({
            username: this.exactUsernameQuery(username),
            ...activeRecordFilter,
        });

        if (!user) {
            throw new Error("User not found");
        }

        if (updateAgencyUserDto.username) {
            updateAgencyUserDto.username = this.normalizeUsername(updateAgencyUserDto.username);
            const duplicateUser = await User.findOne({
                _id: { $ne: user._id },
                username: this.exactUsernameQuery(updateAgencyUserDto.username),
                ...activeRecordFilter,
            }).lean();
            if (duplicateUser) {
                throw new Error("ACCOUNTS.DUPLICATE");
            }
        }

        Object.assign(user, updateAgencyUserDto);
        const result = await user.save();

        return result;
    }

    /**
     * Function to remove user
     * @param username
     * @returns
     */
    async remove(username: string, payload: any = {}) {
        const result = await User.findOneAndUpdate(
            {
                username: this.exactUsernameQuery(username),
                deleted: { $ne: true },
            },
            { $set: getSoftDeleteUpdate(payload) },
            { new: true }
        );
        return result;
    }
}
