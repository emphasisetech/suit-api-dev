import { Request, Response } from 'express';
import { AgencyUserService } from './agencyUserService';
import { responseService } from '../../utils/response.util';
import { MESSAGES } from '../../constants/messages';

const agencyUserService = new AgencyUserService();

export const create = async (req: Request, res: Response) => {
    try {
        // Validation could go here if using Joi/Zod or manual checks
        const result = await agencyUserService.create(req.body);
        return responseService.successResponse(result, MESSAGES.MANAGE_USER.CREATED, res);
    } catch (error: any) {
        if (error.message === 'ACCOUNTS.DUPLICATE') {
            return responseService.ConflictResponse(MESSAGES.DUPLICATE_USER, res);
        }
        return responseService.InvalidDataResponse(error.message, res);
    }
};

export const findAll = async (req: Request, res: Response) => {
    try {
        const search = req.query.search as string;
        const pageNum = parseInt(req.query.pageNum as string) || 1;
        const count = parseInt(req.query.count as string) || 10;

        const result = await agencyUserService.findAll(search, pageNum, count);
        return responseService.successResponse(result, MESSAGES.MANAGE_USER.RETRIEVED, res);
    } catch (error: any) {
        return responseService.InvalidDataResponse(error.message, res);
    }
};

export const findUserByUserName = async (req: Request, res: Response) => {
    try {
        const username = req.params.username as string;
        const result = await agencyUserService.findUserByUserName(username);
        return responseService.successResponse(result, MESSAGES.MANAGE_USER.RETRIEVED, res);
    } catch (error: any) {
        return responseService.InvalidDataResponse(error.message, res);
    }
};

export const findOne = async (req: Request, res: Response) => {
    try {
        const username = req.params.username as string;
        const result = await agencyUserService.findOne(username);
        return responseService.successResponse(result, MESSAGES.MANAGE_USER.RETRIEVED, res);
    } catch (error: any) {
        return responseService.InvalidDataResponse(error.message, res);
    }
};

export const update = async (req: Request, res: Response) => {
    try {
        const username = req.params.username as string;
        const updateDto = req.body;
        const result = await agencyUserService.update(username, updateDto);
        return responseService.successResponse(result, MESSAGES.MANAGE_USER.UPDATED, res);
    } catch (error: any) {
        if (error.message === 'ACCOUNTS.DUPLICATE') {
            return responseService.ConflictResponse(MESSAGES.DUPLICATE_USER, res);
        }
        return responseService.InvalidDataResponse(error.message, res);
    }
};

export const remove = async (req: Request, res: Response) => {
    try {
        const username = req.params.username as string;
        const result = await agencyUserService.remove(username, (req as any).user || {});
        return responseService.successResponse(result, MESSAGES.MANAGE_USER.DELETED, res);
    } catch (error: any) {
        return responseService.InvalidDataResponse(error.message, res);
    }
};
