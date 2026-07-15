import { Request, Response } from 'express';
import { CourseMasterService } from './courseMasterService';
import { responseService } from '../../utils/response.util';

const courseMasterService = new CourseMasterService();

export const create = async (req: Request, res: Response) => {
    try {
        const result = await courseMasterService.create(req.body);
        return responseService.successResponse(result, 'Course created successfully', res, 201);
    } catch (error: any) {
        return responseService.errorResponse(error, res);
    }
};

export const findAll = async (req: Request, res: Response) => {
    try {
        const { client, search } = req.query as any;
        const result = await courseMasterService.findAll(client, search);
        return responseService.successResponse(result, 'Courses retrieved successfully', res);
    } catch (error: any) {
        return responseService.errorResponse(error, res);
    }
};

export const getById = async (req: Request, res: Response) => {
    try {
        const result = await courseMasterService.findById(req.params.id as string);
        return responseService.successResponse(result, 'Course retrieved successfully', res);
    } catch (error: any) {
        if (error.code === 404) return responseService.notFoundResponse('Course not found', res);
        return responseService.errorResponse(error, res);
    }
};

export const update = async (req: Request, res: Response) => {
    try {
        const result = await courseMasterService.update(req.params.id as string, req.body);
        return responseService.successResponse(result, 'Course updated successfully', res);
    } catch (error: any) {
        if (error.code === 404) return responseService.notFoundResponse('Course not found', res);
        return responseService.errorResponse(error, res);
    }
};

export const deleteCourse = async (req: Request, res: Response) => {
    try {
        await courseMasterService.delete(req.params.id as string, (req as any).user || {});
        return responseService.successResponse(null, 'Course deleted successfully', res);
    } catch (error: any) {
        if (error.code === 404) return responseService.notFoundResponse('Course not found', res);
        return responseService.errorResponse(error, res);
    }
};

export const changeStatus = async (req: Request, res: Response) => {
    try {
        const result = await courseMasterService.changeStatus(req.params.id as string);
        return responseService.successResponse(result, 'Course status changed successfully', res);
    } catch (error: any) {
        if (error.code === 404) return responseService.notFoundResponse('Course not found', res);
        return responseService.errorResponse(error, res);
    }
};
