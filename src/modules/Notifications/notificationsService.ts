import Notifications from '../Notifications/model/Notifications';
import { MESSAGES } from '../../constants/messages';
import { ENUM_ROLE } from '../../enums/userEnums';

export class NotificationsService {

    /* Function for creating Notifications */
    async createNotification(updateNotificationsDto: any) {
        try {
            if (Array.isArray(updateNotificationsDto) && updateNotificationsDto.length > 0) {
                // Bulk insert notifications
                await Notifications.insertMany(updateNotificationsDto);
            } else {
                let updateObj = { ...updateNotificationsDto };
                await Notifications.create(updateObj);
            }
            return { message: MESSAGES.NOTIFICATION.CREATED };
        } catch (error) {
            throw error;
        }
    }


    async findAllNotifications(payload: any) {
        try {
            let query: any = {};
            // Check if the payload is SUPER_ADMIN
            if (payload?.userRole?.toLowerCase() == ENUM_ROLE.SUPERADMIN) {
                query.for_super_admin = true;
            } else {
                // Otherwise filter by email (case insensitive)
                if (payload.email) {
                    query.to = { $regex: new RegExp(`^${payload.email}$`, 'i') };
                }
            }

            const list = await Notifications.find(query)
                .sort({ createdAt: -1 })
                .limit(10)
                .lean();

            const mappedList = list.map((item: any) => ({
                title: "Product",
                msg: item.msg,
                page_url: item.page_url,
                createdAt: item.createdAt,
                status: item.seenAt ? false : true
            }));

            return mappedList;
        } catch (error) {
            throw error;
        }
    }


    /* Function for get Notification by Id */
    async getNotification(_id: string) {
        try {
            const object = await Notifications.findById(_id).lean();
            if (object) return object;
            throw { status: 403, message: MESSAGES.NOTIFICATION.DOES_NOT_EXISTS };
        } catch (error) {
            throw error;
        }
    }

    /* Function for update Notification by Id */
    async updateNotification(notification_id: string) {
        try {
            const object = await Notifications.findById(notification_id);
            if (object) {
                const updatedObj = { read: true };
                const update = await Notifications.findByIdAndUpdate(
                    notification_id,
                    updatedObj
                );
                if (update) return { message: MESSAGES.NOTIFICATION.UPDATED };
                throw { status: 403, message: MESSAGES.NOTIFICATION.DOES_NOT_EXISTS };
            } else {
                throw { status: 403, message: MESSAGES.NOTIFICATION.DOES_NOT_EXISTS };
            }
        } catch (error) {
            throw error;
        }
    }

    /* Function for update seen At time Notifications */
    async updateSeenAt(data: { username: string; for_super_admin: boolean }) {
        try {
            let currentDate = new Date();

            let query: any = {};
            if (data.for_super_admin) {
                query["for_super_admin"] = true;
            } else {
                query["to"] = { $regex: `^${data.username}$`, $options: "i" };
            }
            const update = await Notifications.updateMany(
                query,
                { $set: { seenAt: currentDate.toISOString(), status: 1 } }
            );

            // updateMany returns { acknowledged: boolean, modifiedCount: number, ... }
            if (update.acknowledged) {
                return { message: MESSAGES.NOTIFICATION.UPDATED };
            }

            throw { status: 403, message: MESSAGES.NOTIFICATION.DOES_NOT_EXISTS };
        } catch (error) {
            throw error;
        }
    }
}
