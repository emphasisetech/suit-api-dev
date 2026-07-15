// import { Request, Response } from 'express';
// import { ApplicationService } from './applicationService';
// import { responseService } from '../../utils/response.util';
// import { MESSAGES } from '../../constants/messages';

// const applicationService = new ApplicationService();

// export const create = async (req: Request, res: Response) => {
//     try {
//         const result = await applicationService.create(req.body);
//         return responseService.successResponse(result, "Application created successfully", res, 201);
//     } catch (error: any) {
//         console.error("Error creating application:", error);
//         if (error.message === 'APPLICATION.DUPLICATE') {
//             return responseService.ConflictResponse("This Application already exists", res);
//         }
//         return responseService.errorResponse(error, res);
//     }
// };

// export const findAll = async (req: Request, res: Response) => {
//     try {
//         const result = await applicationService.findAll();
//         return responseService.successResponse(result, "Applications retrieved successfully", res);
//     } catch (error: any) {
//         console.error("Error retrieving applications:", error);
//         return responseService.errorResponse(error, res);
//     }
// };

// export const getById = async (req: Request, res: Response) => {
//     try {
//         const id = req.params.id as string;
//         const result = await applicationService.getById(id);
//         return responseService.successResponse(result, "Application retrieved successfully", res);
//     } catch (error: any) {
//         console.error("Error retrieving application by ID:", error);
//         if (error.message === 'APPLICATION.NOT_FOUND') return responseService.notFoundResponse("Application not found", res);
//         return responseService.errorResponse(error, res);
//     }
// };

// export const update = async (req: Request, res: Response) => {
//     try {
//         const id = req.params.id as string;
//         const result = await applicationService.update(id, req.body);
//         return responseService.successResponse(result, "Application updated successfully", res);
//     } catch (error: any) {
//         console.error("Error updating application:", error);
//         if (error.message === 'APPLICATION.NOT_FOUND') return responseService.notFoundResponse("Application not found", res);
//         return responseService.errorResponse(error, res);
//     }
// };

// export const deleteApplication = async (req: Request, res: Response) => {
//     try {
//         const id = req.params.id as string;
//         const result = await applicationService.delete(id);
//         return responseService.successResponse(result, "Application deleted successfully", res);
//     } catch (error: any) {
//         console.error("Error deleting application:", error);
//         if (error.message === 'APPLICATION.NOT_FOUND') return responseService.notFoundResponse("Application not found", res);
//         return responseService.errorResponse(error, res);
//     }
// };
