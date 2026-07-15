import { Request, Response } from 'express';
import { responseService } from '../../utils/response.util';
import { MESSAGES } from '../../constants/messages';
import { DashboardService } from './dashboardService';

const dashboardService = new DashboardService();

export const getDashboardTiles = async (req: Request, res: Response) => {
    try {
        const client = req.query.client as string;

        if (!client) {
            return responseService.InvalidDataResponse("Client is required.", res);
        }

        const payload: any = (req as any).user || { userRole: 'SUPERADMIN' };
        const result = await dashboardService.getDashboardTiles(client, payload);

        return responseService.successResponse(
            result,
            MESSAGES.DATA_FOUND,
            res
        );

    } catch (error: any) {
        console.error("Error retrieving Dashboard Tiles:", error);
        return responseService.errorResponse(error, res);
    }
};
export const getDashboardTileDetails = async (req: Request, res: Response) => {
    try {
        const { client, heading, year } = req.query as { client: string, heading: string, year?: string };

        if (!client || !heading) {
            return responseService.InvalidDataResponse("Client and Heading are required.", res);
        }

        const payload: any = (req as any).user || { userRole: 'SUPERADMIN' };
        const result = await dashboardService.getDashboardTileDetails(client, heading, { ...payload, year });

        return responseService.successResponse(
            result,
            MESSAGES.DATA_FOUND,
            res
        );

    } catch (error: any) {
        console.error("Error retrieving Dashboard Tile Details:", error);
        return responseService.errorResponse(error, res);
    }
};

export const getBirthdays = async (req: Request, res: Response) => {
    try {
        const client = req.query.client as string;

        if (!client) {
            return responseService.InvalidDataResponse("Client is required.", res);
        }

        const result = await dashboardService.getBirthdays(client);

        return responseService.successResponse(
            result,
            MESSAGES.DATA_FOUND,
            res
        );

    } catch (error: any) {
        console.error("Error retrieving Birthdays:", error);
        return responseService.errorResponse(error, res);
    }
};
