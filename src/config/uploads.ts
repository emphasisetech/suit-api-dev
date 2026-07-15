import path from 'path';

export const uploadsRoot = path.resolve(
    process.env.APP_UPLOADS_DIR || path.join(__dirname, '..', '..', 'uploads'),
);

