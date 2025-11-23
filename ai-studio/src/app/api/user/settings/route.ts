import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServer } from "@/lib/supabase-server";
import { notificationSettingsSchema } from "@/lib/validations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const UpdateSettingsSchema = z.object({
  tutorial_enabled: z.boolean().optional(),
  email_notifications: z.boolean().optional(),
  job_completion_notifications: z.boolean().optional(),
  product_updates: z.boolean().optional(),
  reminders_enabled: z.boolean().optional(),
});

export async function GET() {
  const supabase = await createServer();
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }

  try {
    // Fetch user settings
    const { data: settings, error } = await supabase
      .from("user_settings")
      .select("tutorial_enabled, email_notifications, job_completion_notifications, product_updates, reminders_enabled")
      .eq("user_id", user.id)
      .maybeSingle();

    if (error && error.code !== 'PGRST116') { // PGRST116 is "not found", which is fine
      console.error("Failed to fetch user settings:", error);
      return NextResponse.json({ error: "Failed to fetch settings" }, { status: 500, headers: { "Cache-Control": "no-store" } });
    }

    // Return settings with defaults
    return NextResponse.json({ 
      tutorial_enabled: false, // Always disabled
      email_notifications: settings?.email_notifications ?? true,
      job_completion_notifications: settings?.job_completion_notifications ?? true,
      product_updates: settings?.product_updates ?? true,
      reminders_enabled: settings?.reminders_enabled ?? false,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Settings GET error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}

export async function POST(req: NextRequest) {
  const supabase = await createServer();
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }

  try {
    const body = await req.json();
    const validatedData = UpdateSettingsSchema.parse(body);

    // Get current settings to preserve values not being updated
    const { data: currentSettings } = await supabase
      .from("user_settings")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();

    // Prepare update object
    const updateData: Record<string, any> = {
      user_id: user.id,
      tutorial_enabled: false, // Always set to false - tutorial mode is disabled
      updated_at: new Date().toISOString()
    };

    // Only update fields that are provided
    if (validatedData.email_notifications !== undefined) {
      updateData.email_notifications = validatedData.email_notifications;
    } else if (currentSettings?.email_notifications !== undefined) {
      updateData.email_notifications = currentSettings.email_notifications;
    } else {
      updateData.email_notifications = true; // default
    }

    if (validatedData.job_completion_notifications !== undefined) {
      updateData.job_completion_notifications = validatedData.job_completion_notifications;
    } else if (currentSettings?.job_completion_notifications !== undefined) {
      updateData.job_completion_notifications = currentSettings.job_completion_notifications;
    } else {
      updateData.job_completion_notifications = true; // default
    }

    if (validatedData.product_updates !== undefined) {
      updateData.product_updates = validatedData.product_updates;
    } else if (currentSettings?.product_updates !== undefined) {
      updateData.product_updates = currentSettings.product_updates;
    } else {
      updateData.product_updates = true; // default
    }

    if (validatedData.reminders_enabled !== undefined) {
      updateData.reminders_enabled = validatedData.reminders_enabled;
    } else if (currentSettings?.reminders_enabled !== undefined) {
      updateData.reminders_enabled = currentSettings.reminders_enabled;
    } else {
      updateData.reminders_enabled = false; // default
    }

    const { data: settings, error } = await supabase
      .from("user_settings")
      .upsert(updateData, {
        onConflict: "user_id"
      })
      .select()
      .single();

    if (error) {
      console.error("Failed to update user settings:", error);
      return NextResponse.json({ error: "Failed to update settings" }, { status: 500, headers: { "Cache-Control": "no-store" } });
    }

    return NextResponse.json({ 
      tutorial_enabled: false,
      email_notifications: settings.email_notifications,
      job_completion_notifications: settings.job_completion_notifications,
      product_updates: settings.product_updates,
      reminders_enabled: settings.reminders_enabled,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ 
        error: "Validation failed", 
        details: error.issues 
      }, { status: 400, headers: { "Cache-Control": "no-store" } });
    }
    
    console.error("Settings POST error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}

