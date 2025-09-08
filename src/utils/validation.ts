import { z } from 'zod';

export const validateOIB = (oib: string): boolean => {
  if (!oib || oib.length !== 11) {
    return false;
  }

  if (!/^\d{11}$/.test(oib)) {
    return false;
  }

  let checksum = 10;
  
  for (let i = 0; i < 10; i++) {
    checksum = ((checksum + parseInt(oib[i])) % 10 || 10) * 2 % 11;
  }

  checksum = (checksum + parseInt(oib[10])) % 10;
  
  return checksum === 0;
};

export const validateCroatianDate = (dateString: string): boolean => {
  const dateRegex = /^\d{2}\.\d{2}\.\d{4}$/;
  return dateRegex.test(dateString);
};

export const croatianDateToISO = (croatianDate: string): string => {
  const [day, month, year] = croatianDate.split('.');
  return `${year}-${month}-${day}`;
};

export const isoToCroatianDate = (isoDate: string): string => {
  const date = new Date(isoDate);
  const day = date.getDate().toString().padStart(2, '0');
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const year = date.getFullYear();
  return `${day}.${month}.${year}`;
};

export const emailSchema = z.string().email({ message: 'Please provide a valid email address' });

export const passwordSchema = z.string()
  .min(8, { message: 'Password must be at least 8 characters long' })
  .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]+$/, {
    message: 'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character'
  });

export const oibSchema = z.string()
  .optional()
  .nullable()
  .transform(val => {
    if (val === '' || val === null || val === undefined) {
      return undefined;
    }
    return val;
  })
  .refine((val) => !val || validateOIB(val), {
    message: 'Please provide a valid Croatian OIB (11 digits)'
  });

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(1000).default(10),
  sort: z.string().optional(),
  order: z.enum(['asc', 'desc']).default('desc')
});

export const uuidSchema = z.string().uuid({ message: 'Please provide a valid UUID' });

export const positiveDecimalSchema = z.coerce.number()
  .positive({ message: 'Value must be positive' })
  .multipleOf(0.01, { message: 'Value can have at most 2 decimal places' });

export const nonNegativeDecimalSchema = z.coerce.number()
  .nonnegative({ message: 'Value cannot be negative' })
  .multipleOf(0.01, { message: 'Value can have at most 2 decimal places' });