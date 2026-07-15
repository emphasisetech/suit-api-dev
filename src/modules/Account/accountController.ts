import { Request, Response } from 'express';
import { AccountService } from './accountService';
import { responseService } from '../../utils/response.util';
import { MESSAGES } from '../../constants/messages';
import {
    sendEmailVerificationPage,
    wantsHtmlResponse,
} from '../../utils/emailVerificationResponse';

const accountService = new AccountService();

export const create = async (req: Request, res: Response) => {
    try {
        const result = await accountService.create(req.body);
        return responseService.successResponse(result, MESSAGES.ACCOUNTS.CREATED, res, 201);
    } catch (error: any) {
        console.error("Error creating Accounts:", error);
        if (error.code === 11000 || error.message === 'ACCOUNTS.DUPLICATE') {
            return responseService.ConflictResponse(MESSAGES.ACCOUNTS.DUPLICATE, res);
        }
        if (error.message === 'ACCOUNTS.DUPLICATE_DOMAIN') {
            return responseService.ConflictResponse(MESSAGES.ACCOUNTS.DUPLICATE_DOMAIN, res);
        }
        if (error.message === 'ACCOUNTS.DUPLICATE_ACCOUNT_CODE') {
            return responseService.ConflictResponse("Account code already exists", res);
        }
        if (error.message === 'Not Created') {
            return responseService.InvalidDataResponse("Not Created", res);
        }
        return responseService.errorResponse(error, res);
    }
};

export const findAll = async (req: Request, res: Response) => {
    try {
        const payload: any = (req as any).user || { userRole: 'SUPERADMIN' };
        const result = await accountService.findAll(req.query, payload);
        return responseService.successResponse(result, MESSAGES.ACCOUNTS.RETRIEVED, res);
    } catch (error: any) {
        console.error("Error retrieving Accounts:", error);
        if (error.message === 'ACCOUNTS.DOES_NOT_EXISTS') return responseService.notFoundResponse(MESSAGES.ACCOUNTS.DOES_NOT_EXISTS, res);
        return responseService.errorResponse(error, res);
    }
};

export const findAllCount = async (req: Request, res: Response) => {
    try {
        const payload: any = (req as any).user || { userRole: 'SUPERADMIN' };
        const result = await accountService.findAllCount(payload);
        return responseService.successResponse(result, MESSAGES.ACCOUNTS.RETRIEVED, res);
    } catch (error: any) {
        console.error("Error retrieving Accounts count:", error);
        return responseService.errorResponse(error, res);
    }
};

export const getById = async (req: Request, res: Response) => {
    try {
        const result = await accountService.getById(req.params.id as string);
        return responseService.successResponse(result, MESSAGES.ACCOUNTS.RETRIEVED, res);
    } catch (error: any) {
        console.error("Error retrieving Accounts by ID:", error);
        if (error.message === 'ACCOUNTS.NOT_FOUND') return responseService.notFoundResponse(MESSAGES.ACCOUNTS.NOT_FOUND, res);
        return responseService.errorResponse(error, res);
    }
};

export const update = async (req: Request, res: Response) => {
    try {
        const payload: any = (req as any).user || { userRole: 'SUPERADMIN' };
        const result = await accountService.update(req.params.id as string, req.body, payload);
        return responseService.successResponse(result, MESSAGES.ACCOUNTS.UPDATED, res);
    } catch (error: any) {
        console.error("Error updating Accounts:", error);
        if (error.code === 11000 || error.message === 'ACCOUNTS.DUPLICATE') {
            return responseService.ConflictResponse(MESSAGES.ACCOUNTS.DUPLICATE, res);
        }
        if (error.message === 'ACCOUNTS.DUPLICATE_DOMAIN') {
            return responseService.ConflictResponse(MESSAGES.ACCOUNTS.DUPLICATE_DOMAIN, res);
        }
        if (error.message === 'ACCOUNTS.DUPLICATE_ACCOUNT_CODE') {
            return responseService.ConflictResponse("Account code already exists", res);
        }
        if (error.message === 'ACCOUNTS.ACCOUNT_CODE_LOCKED') {
            return responseService.InvalidDataResponse("Account code cannot be changed once set", res);
        }
        if (error.message === 'ACCOUNTS.NOT_FOUND') {
            return responseService.notFoundResponse(MESSAGES.ACCOUNTS.NOT_FOUND, res);
        }
        return responseService.errorResponse(error, res);
    }
};

export const uploadLogo = async (req: Request, res: Response) => {
    try {
        const payload: any = (req as any).user || { userRole: 'SUPERADMIN' };
        const result = await accountService.uploadLogo(req.params.id as string, req.body, payload);
        return responseService.successResponse(result, MESSAGES.ACCOUNTS.UPDATED, res);
    } catch (error: any) {
        console.error("Error uploading account logo:", error);
        if (error.message === 'ACCOUNTS.NOT_FOUND') {
            return responseService.notFoundResponse(MESSAGES.ACCOUNTS.NOT_FOUND, res);
        }
        if (
            error.message === 'ACCOUNT_IMAGE_REQUIRED' ||
            error.message === 'ACCOUNT_IMAGE_INVALID_TYPE' ||
            error.message === 'ACCOUNT_IMAGE_ALREADY_EXISTS' ||
            error.message === 'CLOUDINARY_NOT_CONFIGURED'
        ) {
            return responseService.InvalidDataResponse(error.message, res);
        }
        return responseService.errorResponse(error, res);
    }
};

export const sendEmailVerification = async (req: Request, res: Response) => {
    try {
        const payload: any = (req as any).user || { userRole: 'SUPERADMIN' };
        const result = await accountService.sendEmailVerification(
            req.params.id as string,
            payload
        );
        return responseService.successResponse(result, "Verification email sent", res);
    } catch (error: any) {
        console.error("Error sending account verification email:", error);
        if (error.message === 'ACCOUNTS.NOT_FOUND') {
            return responseService.notFoundResponse(MESSAGES.ACCOUNTS.NOT_FOUND, res);
        }
        if (error.message === 'EMAIL_REQUIRED') {
            return responseService.InvalidDataResponse("Account email is required", res);
        }
        return responseService.errorResponse(error, res);
    }
};

export const verifyEmail = async (req: Request, res: Response) => {
    try {
        const token = String(req.query.token || "");
        if (!token) {
            if (wantsHtmlResponse(req)) {
                return sendEmailVerificationPage(
                    res,
                    400,
                    "Verification link is missing",
                    "Please request a new verification email and try again.",
                );
            }
            return responseService.InvalidDataResponse("Verification token is required", res);
        }

        const result = await accountService.verifyEmail(token);
        if (wantsHtmlResponse(req)) {
            return sendEmailVerificationPage(
                res,
                200,
                "Email verified",
                "Your account email address has been verified successfully.",
            );
        }
        return responseService.successResponse(result, "Email verified successfully", res);
    } catch (error: any) {
        console.error("Error verifying account email:", error);
        if (error.message === 'EMAIL_VERIFICATION_INVALID_OR_EXPIRED') {
            if (wantsHtmlResponse(req)) {
                return sendEmailVerificationPage(
                    res,
                    400,
                    "Verification link expired",
                    "This verification link is invalid or expired. Please request a new verification email.",
                );
            }
            return responseService.InvalidDataResponse("Verification link is invalid or expired", res);
        }
        return responseService.errorResponse(error, res);
    }
};

export const uploadSignature = async (req: Request, res: Response) => {
    try {
        const payload: any = (req as any).user || { userRole: 'SUPERADMIN' };
        const result = await accountService.uploadSignature(
            req.params.id as string,
            req.params.signatureType as string,
            req.body,
            payload
        );
        return responseService.successResponse(result, MESSAGES.ACCOUNTS.UPDATED, res);
    } catch (error: any) {
        console.error("Error uploading account signature:", error);
        if (error.message === 'ACCOUNTS.NOT_FOUND') {
            return responseService.notFoundResponse(MESSAGES.ACCOUNTS.NOT_FOUND, res);
        }
        if (
            error.message === 'ACCOUNT_IMAGE_REQUIRED' ||
            error.message === 'ACCOUNT_IMAGE_INVALID_TYPE' ||
            error.message === 'ACCOUNT_IMAGE_ALREADY_EXISTS' ||
            error.message === 'CLOUDINARY_NOT_CONFIGURED' ||
            error.message === 'INVALID_SIGNATURE_TYPE' ||
            error.message === 'SIGNATURE_UPLOAD_REQUIRES_EDUCATIONAL_ORG'
        ) {
            return responseService.InvalidDataResponse(error.message, res);
        }
        return responseService.errorResponse(error, res);
    }
};

export const deleteAccountImage = async (req: Request, res: Response) => {
    try {
        const payload: any = (req as any).user || { userRole: 'SUPERADMIN' };
        const result = await accountService.deleteAccountImage(
            req.params.id as string,
            req.params.imageType as string,
            payload
        );
        return responseService.successResponse(result, MESSAGES.ACCOUNTS.UPDATED, res);
    } catch (error: any) {
        console.error("Error deleting account image:", error);
        if (error.message === 'ACCOUNTS.NOT_FOUND') {
            return responseService.notFoundResponse(MESSAGES.ACCOUNTS.NOT_FOUND, res);
        }
        if (error.message === 'SUPERADMIN_REQUIRED') {
            return responseService.ForbiddenResponse("Only super admin can delete account images", res);
        }
        if (
            error.message === 'ACCOUNT_IMAGE_NOT_FOUND' ||
            error.message === 'INVALID_ACCOUNT_IMAGE_TYPE' ||
            error.message === 'CLOUDINARY_NOT_CONFIGURED'
        ) {
            return responseService.InvalidDataResponse(error.message, res);
        }
        return responseService.errorResponse(error, res);
    }
};

export const updateServices = async (req: Request, res: Response) => {
    try {
        const result = await accountService.updateServices(req.params.id as string, req.body);
        return responseService.successResponse(result, MESSAGES.ACCOUNTS.UPDATED, res);
    } catch (error: any) {
        console.error("Error updating Accounts:", error);
        if (error.message === 'ACCOUNTS.NOT_FOUND') return responseService.notFoundResponse(MESSAGES.ACCOUNTS.NOT_FOUND, res);
        return responseService.errorResponse(error, res);
    }
};

export const changeStatus = async (req: Request, res: Response) => {
    try {
        const payload: any = (req as any).user || { userRole: 'SUPERADMIN' };
        const result = await accountService.changeStatus(req.params.id as string, payload);
        return responseService.successResponse(result, MESSAGES.ACCOUNTS.STATUS_CHANGED, res);
    } catch (error: any) {
        console.error("Error changing Accounts status:", error);
        if (error.message === 'ACCOUNTS.NOT_FOUND') return responseService.notFoundResponse(MESSAGES.ACCOUNTS.NOT_FOUND, res);
        return responseService.errorResponse(error, res);
    }
};

export const getServicesWithReq = async (req: Request, res: Response) => {
    try {
        const result = await accountService.getServicesWithReq(req.query);
        return responseService.successResponse(result, MESSAGES.ACCOUNTS.RETRIEVED, res);
    } catch (error: any) {
        console.error("Error retrieving Accounts:", error);
        return responseService.errorResponse(error, res);
    }
};

export const updateRequestStatus = async (req: Request, res: Response) => {
    try {
        const { reject } = req.body;
        const result = await accountService.updateRequestStatus(req.body);
        return responseService.successResponse(
            result,
            !reject ? MESSAGES.ACCOUNTS.REQUEST_APPROVE : MESSAGES.ACCOUNTS.REQUEST_CANCELLED,
            res
        );
    } catch (error: any) {
        console.error("Error updating Accounts:", error);
        if (error.code === 11000) {
            return responseService.ConflictResponse(MESSAGES.ACCOUNTS.DUPLICATE, res);
        }
        if (error.message === 'Service not found') return responseService.errorResponse({ message: "Service not found" }, res);
        if (error.message === 'Invalid request type') return responseService.errorResponse({ message: "Invalid request type" }, res);

        return responseService.errorResponse(error, res);
    }
};

export const getAccountByAccountName = async (req: Request, res: Response) => {
    try {
        const result = await accountService.getAccountByAccountName(req.params.account_name as string);
        return responseService.successResponse(result, MESSAGES.ACCOUNTS.RETRIEVED, res);
    } catch (error: any) {
        console.error("Error retrieving Accounts by account_name:", error);
        if (error.message === 'ACCOUNTS.NOT_FOUND') return responseService.notFoundResponse(MESSAGES.ACCOUNTS.NOT_FOUND, res);
        return responseService.errorResponse(error, res);
    }
};

export const getOutlets = async (req: Request, res: Response) => {
    try {
        const result = await accountService.getOutlets(
            req.params.accountName as string,
            (req as any).user || {}
        );
        return responseService.successResponse(result, MESSAGES.ACCOUNTS.RETRIEVED, res);
    } catch (error: any) {
        if (error.message === 'OUTLET_MANAGEMENT_NOT_ALLOWED') {
            return responseService.ForbiddenResponse("Outlet management is not allowed", res);
        }
        if (error.message === 'ACCOUNTS.NOT_FOUND') {
            return responseService.notFoundResponse(MESSAGES.ACCOUNTS.NOT_FOUND, res);
        }
        return responseService.errorResponse(error, res);
    }
};

export const createOutlet = async (req: Request, res: Response) => {
    try {
        const payload: any = (req as any).user || { userRole: 'SUPERADMIN' };
        const result = await accountService.createOutlet(
            req.params.id as string,
            req.body,
            payload
        );
        return responseService.successResponse(result, MESSAGES.ACCOUNTS.UPDATED, res, 201);
    } catch (error: any) {
        if (error.message === 'OUTLET_MANAGEMENT_NOT_ALLOWED') {
            return responseService.ForbiddenResponse("Outlet management is not allowed", res);
        }
        if (error.message === 'ACCOUNTS.NOT_FOUND') {
            return responseService.notFoundResponse(MESSAGES.ACCOUNTS.NOT_FOUND, res);
        }
        if (error.message === 'OUTLET_DUPLICATE') {
            return responseService.ConflictResponse("Outlet already exists", res);
        }
        if (
            error.message === 'OUTLETS_REQUIRE_FRANCHISE' ||
            error.message === 'OUTLET_NAME_REQUIRED'
        ) {
            return responseService.InvalidDataResponse(error.message, res);
        }
        return responseService.errorResponse(error, res);
    }
};

export const updateOutlet = async (req: Request, res: Response) => {
    try {
        const payload: any = (req as any).user || { userRole: 'SUPERADMIN' };
        const result = await accountService.updateOutlet(
            req.params.id as string,
            req.params.outletId as string,
            req.body,
            payload
        );
        return responseService.successResponse(result, MESSAGES.ACCOUNTS.UPDATED, res);
    } catch (error: any) {
        if (error.message === 'OUTLET_MANAGEMENT_NOT_ALLOWED') {
            return responseService.ForbiddenResponse("Outlet management is not allowed", res);
        }
        if (error.message === 'ACCOUNTS.NOT_FOUND' || error.message === 'OUTLET_NOT_FOUND') {
            return responseService.notFoundResponse("Outlet not found", res);
        }
        return responseService.errorResponse(error, res);
    }
};

export const deleteOutlet = async (req: Request, res: Response) => {
    try {
        const payload: any = (req as any).user || { userRole: 'SUPERADMIN' };
        const result = await accountService.deleteOutlet(
            req.params.id as string,
            req.params.outletId as string,
            payload
        );
        return responseService.successResponse(result, MESSAGES.ACCOUNTS.UPDATED, res);
    } catch (error: any) {
        if (error.message === 'OUTLET_MANAGEMENT_NOT_ALLOWED') {
            return responseService.ForbiddenResponse("Outlet management is not allowed", res);
        }
        if (error.message === 'ACCOUNTS.NOT_FOUND' || error.message === 'OUTLET_NOT_FOUND') {
            return responseService.notFoundResponse("Outlet not found", res);
        }
        if (error.message === 'DEFAULT_OUTLET_DELETE_NOT_ALLOWED') {
            return responseService.InvalidDataResponse("Default outlet cannot be deleted", res);
        }
        return responseService.errorResponse(error, res);
    }
};
