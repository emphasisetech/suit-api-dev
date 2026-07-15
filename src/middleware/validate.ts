import { Request, Response, NextFunction } from 'express';
import { responseService } from '../utils/response.util';

export interface ValidationRule {
    required?: boolean;
    type?: 'string' | 'number' | 'boolean' | 'date' | 'array' | 'email';
    min?: number;
    max?: number;
    enum?: any[];
}

export interface ValidationSchema {
    [key: string]: ValidationRule | ValidationSchema;
}

export const validate = (schema: ValidationSchema, source: 'body' | 'query' | 'params' = 'body') => {
    return (req: Request, res: Response, next: NextFunction) => {
        const data = req[source];
        const errors: string[] = [];

        Object.keys(schema).forEach((key) => {
            const rule = schema[key] as ValidationRule;
            const value = data[key];

            // Required check
            if (rule.required && (value === undefined || value === null || value === '')) {
                errors.push(`${key} is required`);
                return;
            }

            if (value !== undefined && value !== null && value !== '') {
                // Type check
                if (rule.type === 'string' && typeof value !== 'string') {
                    errors.push(`${key} must be a string`);
                } else if (rule.type === 'number' && typeof value !== 'number' && isNaN(Number(value))) {
                    errors.push(`${key} must be a number`);
                } else if (rule.type === 'boolean' && typeof value !== 'boolean' && value !== 'true' && value !== 'false') {
                    errors.push(`${key} must be a boolean`);
                } else if (rule.type === 'array' && !Array.isArray(value)) {
                    errors.push(`${key} must be an array`);
                } else if (rule.type === 'email') {
                    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                    if (!emailRegex.test(value)) {
                        errors.push(`${key} must be a valid email`);
                    }
                }

                // Min/Max check
                if (rule.min !== undefined) {
                    if (rule.type === 'string' && value.length < rule.min) {
                        errors.push(`${key} must be at least ${rule.min} characters`);
                    } else if (rule.type === 'number' && Number(value) < rule.min) {
                        errors.push(`${key} must be at least ${rule.min}`);
                    }
                }

                if (rule.max !== undefined) {
                    if (rule.type === 'string' && value.length > rule.max) {
                        errors.push(`${key} must be at most ${rule.max} characters`);
                    } else if (rule.type === 'number' && Number(value) > rule.max) {
                        errors.push(`${key} must be at most ${rule.max}`);
                    }
                }

                // Enum check
                if (rule.enum && !rule.enum.includes(value)) {
                    errors.push(`${key} must be one of: ${rule.enum.join(', ')}`);
                }
            }
        });

        if (errors.length > 0) {
            return responseService.InvalidDataResponse(errors.join(', '), res);
        }

        next();
    };
};
