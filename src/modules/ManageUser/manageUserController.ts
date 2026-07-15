import { Request, Response } from 'express';
import { ManageUserService } from './manageUserService';
import { responseService } from '../../utils/response.util';
import { MESSAGES } from '../../constants/messages';

const manageUserService = new ManageUserService();

export const create = async (req: Request, res: Response) => {
    try {
        const payload: any = (req as any).user || { userRole: 'SUPERADMIN' };
        const result = await manageUserService.create(req.body, payload);
        return responseService.successResponse(result, MESSAGES.MANAGE_USER.CREATED, res, 201);
    } catch (error: any) {
        if (error.code === 409 || error.message === MESSAGES.DUPLICATE_USER) {
            return responseService.ConflictResponse(MESSAGES.DUPLICATE_USER, res);
        }
        return responseService.errorResponse(error, res);
    }
};

export const findAll = async (req: Request, res: Response) => {
    try {
        const { client, search,  pageNum, count } = req.query as any;
        const channel = (req as any).user ? (req as any).user['custom:channel'] : null;

        const payload: any = (req as any).user || { userRole: 'SUPERADMIN' };

        const result = await manageUserService.findAll(
            client,
            search,
            parseInt(pageNum) || 1,
            parseInt(count) || 10,
            channel,
            payload
        );
        return responseService.successResponse(result, MESSAGES.MANAGE_USER.RETRIEVED, res);
    } catch (error: any) {
        return responseService.errorResponse(error, res);
    }
};

export const findOne = async (req: Request, res: Response) => {
    try {
        const result = await manageUserService.findOne(req.params.username as string);
        return responseService.successResponse(result, MESSAGES.MANAGE_USER.RETRIEVED, res);
    } catch (error: any) {
        if (error.code === 409 || error.message === MESSAGES.DUPLICATE_USER) {
            return responseService.ConflictResponse(MESSAGES.DUPLICATE_USER, res);
        }
        return responseService.errorResponse(error, res);
    }
};

export const update = async (req: Request, res: Response) => {
    try {
        const updateDto = req.body;
        // Fix for specific field handling if needed, as per original code
        if (Array.isArray(updateDto.parent_dealers)) {
            updateDto.parent_dealers = updateDto.parent_dealers;
        }

        const payload: any = (req as any).user || { userRole: 'SUPERADMIN' };
        const result = await manageUserService.update(req.params.username as string, updateDto, payload);
        return responseService.successResponse(result, MESSAGES.MANAGE_USER.UPDATED, res);
    } catch (error: any) {
        return responseService.errorResponse(error, res);
    }
};

export const remove = async (req: Request, res: Response) => {
    try {
        const payload: any = (req as any).user || { userRole: 'SUPERADMIN' };
        const result = await manageUserService.remove(req.params.username as string, payload);
        return responseService.successResponse(result, MESSAGES.MANAGE_USER.DELETED, res);
    } catch (error: any) {
        return responseService.errorResponse(error, res);
    }
};

export const updateProfilePic = async (req: Request, res: Response) => {
    try {
        const result = await manageUserService.updateProfilePic(req.params.username as string, req.body);
        // Note: Original code used MANAGEUSER.UPDATED_PROFILE but that key wasn't in MESSAGES.ts in previous turn.
        // Using UPDATED for now.
        return responseService.successResponse(result, MESSAGES.MANAGE_USER.UPDATED, res);
    } catch (error: any) {
        return responseService.errorResponse(error, res);
    }
};

export const removeProfilePic = async (req: Request, res: Response) => {
    try {
        const filename = req.query.filename as string;
        const result = await manageUserService.removeProfilePic(req.params.username as string, filename);
        return responseService.successResponse(result, MESSAGES.MANAGE_USER.DELETED, res);
    } catch (error: any) {
        return responseService.errorResponse(error, res);
    }
};

export const importUsers = async (req: Request, res: Response) => {
    try {
        const result = await manageUserService.importUsersInDatabase(req.body);
        return responseService.successResponse(result, MESSAGES.MANAGE_USER.UPDATED, res);
    } catch (error: any) {
        return responseService.errorResponse(error, res);
    }
};
