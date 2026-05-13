/**
 * Centralized Zod validation schemas for all API endpoints.
 * Replace manual inline validation with these schemas.
 */

import { z } from 'zod';
import { PASSWORD_MIN_LENGTH } from '../utils/passwordPolicy.js';

// ── Auth ────────────────────────────────────────────────────────────────────────

const emailSchema = z.string().email('Invalid email address.').transform(v => v.toLowerCase().trim());

const passwordSchema = z.string()
  .min(PASSWORD_MIN_LENGTH, `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`)
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter.')
  .regex(/[a-z]/, 'Password must contain at least one lowercase letter.')
  .regex(/\d/, 'Password must contain at least one number.')
  .regex(/[!@#$%^&*(),.?":{}|<>_\-~`+=\[\]\\;'\/]/, 'Password must contain at least one special character.');

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required.'),
});

export const setupSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  firstName: z.string().trim().min(1, 'First name is required.'),
  lastName: z.string().trim().min(1, 'Last name is required.'),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required.'),
  newPassword: passwordSchema,
});

export const createUserSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  firstName: z.string().trim().min(1, 'First name is required.'),
  lastName: z.string().trim().min(1, 'Last name is required.'),
  role: z.enum(['admin', 'editor', 'viewer'], { message: 'Invalid role.' }),
});

export const updateProfileSchema = z.object({
  firstName: z.string().trim().min(1, 'First name is required.'),
  lastName: z.string().trim().min(1, 'Last name is required.'),
});

export const updateRoleSchema = z.object({
  role: z.enum(['admin', 'editor', 'viewer'], { message: 'Invalid role.' }),
});

// ── Companies ────────────────────────────────────────────────────────────────────

export const createCompanySchema = z.object({
  name: z.string().trim().min(1, 'Company name is required.'),
  industry: z.string().optional(),
  website: z.string().url().optional().or(z.literal('')),
});

// ── Jobs ──────────────────────────────────────────────────────────────────────────

export const createJobSchema = z.object({
  title: z.string().min(1, 'Job title is required.'),
  source: z.enum(['linkedin', 'indeed', 'glassdoor', 'company_website', 'other'], { message: 'Invalid source.' }),
  url: z.string().url('Invalid URL.'),
  companyId: z.string().optional(),
  rawCompanyName: z.string().optional(),
}).refine(
  data => data.companyId || data.rawCompanyName,
  { message: 'Either companyId or rawCompanyName is required.' }
);

// ── Applications ──────────────────────────────────────────────────────────────────

export const applicationStatusSchema = z.object({
  jobId: z.string().min(1),
  candidateId: z.string().min(1),
  status: z.enum(['Saved', 'Applied', 'Interview', 'Offer', 'Rejected', 'Placed']),
});

// ── Campaigns ─────────────────────────────────────────────────────────────────────

export const campaignSendSchema = z.object({
  fromEmail: z.string().email().optional(),
  fromName: z.string().optional(),
  subject: z.string().min(1, 'Subject is required.'),
  scheduleDate: z.string().optional(),
  workFilter: z.string().optional(),
  templateServiceId: z.string().optional(),
});

// ── Export ─────────────────────────────────────────────────────────────────────────

export type LoginInput = z.infer<typeof loginSchema>;
export type SetupInput = z.infer<typeof setupSchema>;
export type CreateUserInput = z.infer<typeof createUserSchema>;
export type CreateJobInput = z.infer<typeof createJobSchema>;
