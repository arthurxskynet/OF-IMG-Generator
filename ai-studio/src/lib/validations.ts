import { z } from "zod";

export const profileUpdateSchema = z.object({
  full_name: z.string().min(1, "Full name is required").max(100, "Full name is too long"),
});

export const emailUpdateSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

export const passwordUpdateSchema = z.object({
  current_password: z.string().min(1, "Current password is required"),
  new_password: z.string().min(8, "Password must be at least 8 characters"),
  confirm_password: z.string().min(1, "Please confirm your password"),
}).refine((data) => data.new_password === data.confirm_password, {
  message: "Passwords do not match",
  path: ["confirm_password"],
});

export const notificationSettingsSchema = z.object({
  email_notifications: z.boolean(),
  job_completion_notifications: z.boolean(),
  product_updates: z.boolean(),
  reminders_enabled: z.boolean(),
});

export type ProfileUpdateInput = z.infer<typeof profileUpdateSchema>;
export type EmailUpdateInput = z.infer<typeof emailUpdateSchema>;
export type PasswordUpdateInput = z.infer<typeof passwordUpdateSchema>;
export type NotificationSettingsInput = z.infer<typeof notificationSettingsSchema>;

