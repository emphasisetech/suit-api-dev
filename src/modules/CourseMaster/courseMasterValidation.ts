import { ValidationSchema } from '../../middleware/validate';

export const createCourseMasterSchema: ValidationSchema = {
    client: { required: true, type: 'string' },
    course_name: { required: true, type: 'string' },
    course_type: { type: 'string', enum: ['class', 'professional'] },
    fee: { type: 'number' },
    subject_fee_options: { type: 'array' },
    registration_required: { type: 'boolean' },
    registration_fee: { type: 'number' }
};

export const updateCourseMasterSchema: ValidationSchema = {
    client: { type: 'string' },
    course_name: { type: 'string' },
    course_type: { type: 'string', enum: ['class', 'professional'] },
    fee: { type: 'number' },
    subject_fee_options: { type: 'array' },
    registration_required: { type: 'boolean' },
    registration_fee: { type: 'number' }
};
