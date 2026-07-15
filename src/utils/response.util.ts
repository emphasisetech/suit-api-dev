import { Response } from 'express';

export const responseService = {
    successResponse: (data: any, message: string, res: Response, status: number = 200) => {
        return res.status(status).json({ success: true, message, data, statusCode: status });
    },
    errorResponse: (error: any, res: Response) => {
        const message = error.message || 'Server Error';
        if (
            message === "DISPOSABLE_EMAIL_NOT_ALLOWED" ||
            message.includes("Disposable or temporary email addresses are not allowed")
        ) {
            return res.status(400).json({
                success: false,
                message: "Disposable or temporary email addresses are not allowed",
            });
        }
        return res.status(500).json({ success: false, message, error });
    },
    InvalidDataResponse: (message: string, res: Response) => {
        return res.status(400).json({ success: false, message });
    },
    ConflictResponse: (message: string, res: Response) => {
        return res.status(409).json({ success: false, message });
    },
    notFoundResponse: (message: string, res: Response) => {
        return res.status(404).json({ success: false, message });
    },
    ForbiddenResponse: (message: string, res: Response) => {
        return res.status(403).json({ success: false, message });
    }
};
