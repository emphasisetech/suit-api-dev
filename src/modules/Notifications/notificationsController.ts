import { Request, Response } from 'express';
import { NotificationsService } from './notificationsService';
import { responseService } from '../../utils/response.util';
import { MESSAGES } from '../../constants/messages';

const notificationsService = new NotificationsService();

export const create = async (req: Request, res: Response) => {
    try {
        const result = await notificationsService.createNotification(req.body);
        return responseService.successResponse(null, MESSAGES.NOTIFICATION.CREATED, res, 201);
    } catch (error: any) {
        return responseService.errorResponse(error, res);
    }
};

export const findAll = async (req: Request, res: Response) => {
    try {
        // Assuming payload is attached to req.user by auth middleware
        const payload = (req as any).user;
        const result = await notificationsService.findAllNotifications(payload);
        return responseService.successResponse(result, MESSAGES.NOTIFICATION.RETRIEVED, res);
    } catch (error: any) {
        return responseService.errorResponse(error, res);
    }
};

export const updateMany = async (req: Request, res: Response) => {
    try {
        const result = await notificationsService.updateSeenAt(req.body);
        return responseService.successResponse(null, MESSAGES.NOTIFICATION.UPDATED, res);
    } catch (error: any) {
        return responseService.errorResponse(error, res);
    }
};
