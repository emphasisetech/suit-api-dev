import User from '../User/model/User';
import jwt from 'jsonwebtoken';
import { ENUM_ROLE } from '../../enums/userEnums';
import { activeRecordFilter } from '../../utils/softDelete';

export class AuthService {
    private normalizeUsername(value: any) {
        return String(value || "").trim().toLowerCase();
    }

    private exactUsernameQuery(value: any) {
        const escaped = this.normalizeUsername(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        return { $regex: new RegExp(`^${escaped}$`, "i") };
    }


    // Helper to sign tokens
    private generateAccessToken(payload: any) {
        return jwt.sign(payload, process.env.JWT_SECRET as string, { expiresIn: '1h' });
    }

    // Simulate ID token
    private generateIdToken(user: any) {
        const payload = {
            sub: user._id,
            username: user.username,
            email: user.email,
            name: user.name,
            userRole: user.userRole,
            userType: user.userType
        };
        return jwt.sign(payload, process.env.JWT_SECRET as string, { expiresIn: '1h' });
    }

    async signup(data: any) {
        const { username, email, password, name, userRole, ...otherData } = data;
        const normalizedUsername = this.normalizeUsername(username);

        // Check availability
        const userExists = await User.findOne({
            ...activeRecordFilter,
            $or: [{ email }, { username: this.exactUsernameQuery(normalizedUsername) }]
        });

        if (userExists) {
            throw new Error('DUPLICATE_USER');
        }

        // Create user
        const user = await User.create({
            username: normalizedUsername,
            email,
            password,
            name,
            userRole: userRole || ENUM_ROLE.HEAD_OFFICE,
            ...otherData
        });

        const userResponse = user.toObject();
        delete (userResponse as any).password;

        return userResponse;
    }

    async login(data: any) {
        const { username, password } = data;

        // 1. Validate User
        const user = await User.findOne({ username: this.exactUsernameQuery(username), ...activeRecordFilter });

        if (!user) {
            throw new Error('INVALID_CREDENTIALS');
        }

        // 2. Compare Password
        const isMatch = await user.comparePassword(password);
        if (!isMatch) {
            throw new Error('INVALID_CREDENTIALS');
        }

        // 3. Generate Response
        const payload = {
            sub: user._id,
            username: user.username,
            userRole: user.userRole,
        };

        const access_token = this.generateAccessToken(payload);
        const id_token = this.generateIdToken(user);

        return {
            userRole: user.userRole,
            access_token: access_token,
            id_token: id_token,
            expires_in: 3600,
            refresh_token: "dsjdkh",
        };
    }
}
