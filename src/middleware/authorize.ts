import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth';

export const authorize = (...roles: string[]) => {
    return (req: AuthRequest, res: Response, next: NextFunction) => {
        if (!req.user) {
            return res.status(401).json({ message: 'Not authorized, no user found' });
        }
        console.log(req.user.userRole, roles);

        if (!roles.includes(req.user.userRole)) {
            return res.status(403).json({
                message: `User role ${req.user.userRole} is not authorized to access this route`
            });
        }

        next();
    };
};
