import { Request, Response } from 'express';
import DemoRequest, { DemoRequestStatus } from './model/DemoRequest';
import Newsletter from './model/Newsletter';
import { responseService } from '../../utils/response.util';
import { assertAllowedEmail } from '../../utils/emailValidation';
import { activeRecordFilter, getSoftDeleteUpdate } from '../../utils/softDelete';

// Public: Create Demo Request
export const createDemoRequest = async (req: Request, res: Response) => {
  try {
    const { name, phone, email, address, enterprise_name } = req.body;

    if (!name || !phone || !email) {
      return responseService.InvalidDataResponse('Name, phone, and email are required', res);
    }
    assertAllowedEmail(email);

    const demoRequest = new DemoRequest({
      name,
      phone,
      email,
      address,
      enterprise_name,
      status: DemoRequestStatus.PENDING
    });

    await demoRequest.save();

    return responseService.successResponse(demoRequest, 'Demo request submitted successfully', res, 201);
  } catch (error: any) {
    if (error.message === "DISPOSABLE_EMAIL_NOT_ALLOWED") {
      return responseService.InvalidDataResponse(
        "Disposable or temporary email addresses are not allowed",
        res,
      );
    }
    console.error('createDemoRequest error:', error);
    return responseService.errorResponse(error, res);
  }
};

// Admin: Get all Demo Requests
export const getDemoRequests = async (req: Request, res: Response) => {
  try {
    const requests = await DemoRequest.find().sort({ createdAt: -1 });
    return responseService.successResponse(requests, 'Demo requests retrieved successfully', res);
  } catch (error: any) {
    console.error('getDemoRequests error:', error);
    return responseService.errorResponse(error, res);
  }
};

// Admin: Update Demo Request Status
export const updateDemoRequestStatus = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!Object.values(DemoRequestStatus).includes(status)) {
      return responseService.InvalidDataResponse('Invalid status', res);
    }

    const demoRequest = await DemoRequest.findByIdAndUpdate(id, { status }, { new: true });

    if (!demoRequest) {
      return responseService.notFoundResponse('Demo request not found', res);
    }
    return responseService.successResponse(demoRequest, 'Status updated successfully', res);
  } catch (error: any) {
    console.error('updateDemoRequestStatus error:', error);
    return responseService.errorResponse(error, res);
  }
};

// Public: Subscribe Newsletter
export const subscribeNewsletter = async (req: Request, res: Response) => {
  try {
    const { email } = req.body;

    if (!email) {
      return responseService.InvalidDataResponse('Email is required', res);
    }
    assertAllowedEmail(email);

    const existing = await Newsletter.findOne({ email, ...activeRecordFilter });
    if (existing) {
      return responseService.InvalidDataResponse('Already subscribed', res);
    }

    const subscription = new Newsletter({ email });
    await subscription.save();

    return responseService.successResponse(subscription, 'Subscribed successfully', res, 201);
  } catch (error: any) {
    if (error.message === "DISPOSABLE_EMAIL_NOT_ALLOWED") {
      return responseService.InvalidDataResponse(
        "Disposable or temporary email addresses are not allowed",
        res,
      );
    }
    console.error('subscribeNewsletter error:', error);
    return responseService.errorResponse(error, res);
  }
};

// Admin: Get all Newsletter Subscriptions
export const getNewsletterSubscriptions = async (req: Request, res: Response) => {
  try {
    const subscriptions = await Newsletter.find(activeRecordFilter).sort({ createdAt: -1 });
    return responseService.successResponse(subscriptions, 'Newsletter subscriptions retrieved successfully', res);
  } catch (error: any) {
    console.error('getNewsletterSubscriptions error:', error);
    return responseService.errorResponse(error, res);
  }
};

// Admin: Update Newsletter Subscription Status
export const updateNewsletterSubscriptionStatus = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (![0, 1].includes(Number(status))) {
      return responseService.InvalidDataResponse('Invalid status', res);
    }
    const subscription = await Newsletter.findOneAndUpdate(
      { _id: id, ...activeRecordFilter },
      { status: Number(status) },
      { new: true }
    );

    if (!subscription) {
      return responseService.notFoundResponse('Newsletter subscription not found', res);
    }

    return responseService.successResponse(subscription, 'Newsletter subscription status updated successfully', res);
  } catch (error: any) {
    console.error('updateNewsletterSubscriptionStatus error:', error);
    return responseService.errorResponse(error, res);
  }
};

// Admin: Delete Newsletter Subscription
export const deleteNewsletterSubscription = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const subscription = await Newsletter.findOneAndUpdate(
      { _id: id, ...activeRecordFilter },
      { $set: getSoftDeleteUpdate((req as any).user || {}) },
      { new: true }
    );

    if (!subscription) {
      return responseService.notFoundResponse('Newsletter subscription not found', res);
    }

    return responseService.successResponse(subscription, 'Newsletter subscription deleted successfully', res);
  } catch (error: any) {
    console.error('deleteNewsletterSubscription error:', error);
    return responseService.errorResponse(error, res);
  }
};
