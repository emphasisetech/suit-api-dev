import { ValidationSchema } from '../../middleware/validate';
import { PaymentStatus, CourseStatus, PaymentFrequency } from '../../enums/studentEnums';

export const createStudentSchema: ValidationSchema = {
    name: { required: true, type: 'string', min: 2 },
    client: { required: true, type: 'string' },
    student_key: { type: 'string' },
    email: { type: 'email' },
    phone_number: { type: 'string', min: 10 },
    whatsapp_number: { type: 'string', min: 10 },
    image_url: { type: 'string' },
    aadhar_number: { type: 'string', min: 12, max: 12 },
    dob: { type: 'string' }
};

export const updateStudentSchema: ValidationSchema = {
    name: { type: 'string', min: 2 },
    student_key: { type: 'string' },
    email: { type: 'email' },
    phone_number: { type: 'string', min: 10 },
    whatsapp_number: { type: 'string', min: 10 },
    image_url: { type: 'string' },
    aadhar_number: { type: 'string', min: 12, max: 12 },
    dob: { type: 'string' }
};

export const addPaymentSchema: ValidationSchema = {
    student_id: { required: true, type: 'string' },
    course_id: { required: true, type: 'string' },
    payment_mode: { required: true, type: 'string' },
    payment_amount: { required: true, type: 'number', min: 0 },
    payment_date: { type: 'string' },
    remarks: { type: 'string' },
    payment_status: { enum: Object.values(PaymentStatus) }
};

export const createCourseSchema: ValidationSchema = {
    student_id: { required: true, type: 'string' },
    course_name: { required: true, type: 'string' },
    course_type: { type: 'string', enum: ['class', 'professional'] },
    selected_subject_count: { type: 'string' },
    course_fee: { required: true, type: 'number' },
    total_course_fee: { type: 'number' },
    fee_ferquency: { enum: Object.values(PaymentFrequency) },
    course_duration: { type: 'string' },
    course_start_date: { type: 'string' },
    course_end_date: { type: 'string' },
    course_status: { enum: [0, 1] },
    registration_required: { type: 'boolean' },
    registration_fee: { type: 'number' }
};
