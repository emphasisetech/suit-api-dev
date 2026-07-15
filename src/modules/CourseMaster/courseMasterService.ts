import CourseMaster, { ICourseMaster } from './model/CourseMaster';
import { activeRecordFilter, getSoftDeleteUpdate } from '../../utils/softDelete';

export class CourseMasterService {
    async create(data: any) {
        const { client, ...courseData } = data;
        courseData.course_type = courseData.course_type || 'class';
        courseData.subject_fee_options = Array.isArray(courseData.subject_fee_options)
            ? courseData.subject_fee_options
            : [];
        if (courseData.course_type === 'class') {
            courseData.is_certificate = false;
            courseData.registration_required = false;
            courseData.registration_fee = 0;
        }
        let master = await CourseMaster.findOne({ client });
        
        if (!master) {
            master = new CourseMaster({ client, courses: [courseData] });
        } else {
            master.courses.push(courseData);
        }
        await master.save();
        return master.courses[master.courses.length - 1];
    }

    async findAll(client: string, search: string = '') {
        const master = await CourseMaster.findOne({ client });
        if (!master || !master.courses) return [];
        let courses = master.courses.filter((course: any) => course.deleted !== true);
        if (search) {
            courses = courses.filter(c => c.course_name.toLowerCase().includes(search.toLowerCase()));
        }
        return courses.sort((a, b) => a.order - b.order);
    }

    async findById(id: string) {
        const master = await CourseMaster.findOne({ "courses._id": id, "courses.deleted": { $ne: true } });
        if (!master) throw { code: 404, message: 'COURSE.NOT_FOUND' };
        return master.courses.find((c: any) => c._id?.toString() === id && c.deleted !== true);
    }

    async update(id: string, data: any) {
        const master = await CourseMaster.findOne({ "courses._id": id, "courses.deleted": { $ne: true } });
        if (!master) throw { code: 404, message: 'COURSE.NOT_FOUND' };
        
        const courseIndex = master.courses.findIndex((c: any) => c._id?.toString() === id && c.deleted !== true);
        if (courseIndex === -1) throw { code: 404, message: 'COURSE.NOT_FOUND' };
        
        if (data.client) delete data.client;
        if ((data.course_type || master.courses[courseIndex].course_type || 'class') === 'class') {
            data.is_certificate = false;
            data.registration_required = false;
            data.registration_fee = 0;
        }

        Object.keys(data).forEach(key => {
            (master.courses[courseIndex] as any)[key] = data[key];
        });
        
        await master.save();
        return master.courses[courseIndex];
    }

    async delete(id: string, payload: any = {}) {
        const master = await CourseMaster.findOne({ "courses._id": id, "courses.deleted": { $ne: true } });
        if (!master) throw { code: 404, message: 'COURSE.NOT_FOUND' };

        const course = master.courses.find((c: any) => c._id?.toString() === id && c.deleted !== true);
        if (!course) {
            throw { code: 404, message: 'COURSE.NOT_FOUND' };
        }

        Object.assign(course as any, getSoftDeleteUpdate(payload));
        await master.save();
        return true;
    }

    async changeStatus(id: string) {
        const master = await CourseMaster.findOne({ "courses._id": id, "courses.deleted": { $ne: true } });
        if (!master) throw { code: 404, message: 'COURSE.NOT_FOUND' };
        
        const course = master.courses.find((c: any) => c._id?.toString() === id && c.deleted !== true);
        if (!course) throw { code: 404, message: 'COURSE.NOT_FOUND' };
        
        course.status = !course.status;
        await master.save();
        return course;
    }
}
