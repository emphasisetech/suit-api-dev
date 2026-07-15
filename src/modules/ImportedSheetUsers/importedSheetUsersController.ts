import { Request, Response } from 'express';
import { ImportedSheetUsersService } from './importedSheetUsersService';
import { responseService } from '../../utils/response.util';
import { MESSAGES } from '../../constants/messages';

const importedSheetUsersService = new ImportedSheetUsersService();

export const create = async (req: Request, res: Response) => {
    try {
        const result = await importedSheetUsersService.create(req.body);
        return responseService.successResponse(result, MESSAGES.IMPORTED_USERS_SHEET.CREATED, res, 201);
    } catch (error: any) {
        if (error.message && error.message.includes("validation failed")) {
            return responseService.InvalidDataResponse(error.message, res);
        }
        return responseService.errorResponse(error, res);
    }
};

export const findAll = async (req: Request, res: Response) => {
    try {
        const client = req.query.client as string;
        const result = await importedSheetUsersService.findAll(client);
        return responseService.successResponse(result, MESSAGES.IMPORTED_USERS_SHEET.RETRIEVED, res);
    } catch (error: any) {
        return responseService.errorResponse(error, res);
    }
};

export const downloadSheet = async (req: Request, res: Response) => {
    try {
        const result = await importedSheetUsersService.downloadSheet(req.params.sheet_id as string);
        return responseService.successResponse(result, MESSAGES.IMPORTED_USERS_SHEET.RETRIEVED, res);
    } catch (error: any) {
        return responseService.errorResponse(error, res);
    }
};

export const deleteSheet = async (req: Request, res: Response) => {
    try {
        const result = await importedSheetUsersService.deleteSheet(req.params.sheet_id as string, (req as any).user || {});
        return responseService.successResponse(result, MESSAGES.IMPORTED_USERS_SHEET.DELETED, res);
    } catch (error: any) {
        return responseService.errorResponse(error, res);
    }
};
