import { NextRequest, NextResponse } from "next/server";
import { createServer } from "@/lib/supabase-server";
import { emailUpdateSchema } from "@/lib/validations";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(req: NextRequest) {
  const supabase = await createServer();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }

  try {
    const body = await req.json();
    const validatedData = emailUpdateSchema.parse(body);

    // Verify current password by attempting to sign in
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: user.email!,
      password: validatedData.password,
    });

    if (signInError) {
      return NextResponse.json({ error: "Invalid password" }, { status: 401, headers: { "Cache-Control": "no-store" } });
    }

    // Update email (Supabase will send confirmation email)
    const { error: updateError } = await supabase.auth.updateUser({
      email: validatedData.email,
    });

    if (updateError) {
      console.error("Failed to update email:", updateError);
      return NextResponse.json({ error: updateError.message || "Failed to update email" }, { status: 400, headers: { "Cache-Control": "no-store" } });
    }

    return NextResponse.json({
      message: "Email update confirmation sent. Please check your new email inbox.",
      email: validatedData.email,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({
        error: "Validation failed",
        details: error.issues
      }, { status: 400, headers: { "Cache-Control": "no-store" } });
    }

    console.error("Email update error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}

