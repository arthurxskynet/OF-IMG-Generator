import { NextRequest, NextResponse } from "next/server";
import { createServer } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";

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
    const formData = await req.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400, headers: { "Cache-Control": "no-store" } });
    }

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json({ error: "Invalid file type" }, { status: 400, headers: { "Cache-Control": "no-store" } });
    }

    // Validate file size (max 5MB for avatars)
    const maxSize = 5 * 1024 * 1024; // 5MB
    if (file.size > maxSize) {
      return NextResponse.json({ error: "File size exceeds 5MB limit" }, { status: 400, headers: { "Cache-Control": "no-store" } });
    }

    // Convert file to buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Generate unique filename
    const timestamp = Date.now();
    const randomSuffix = Math.random().toString(36).slice(2, 8);
    const ext = file.name.split('.').pop() || 'jpg';
    const filename = `${user.id}/${timestamp}-${randomSuffix}.${ext}`;

    // Upload to avatars bucket
    const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
      .from("avatars")
      .upload(filename, buffer, {
        contentType: file.type,
        upsert: false
      });

    if (uploadError) {
      console.error("Avatar upload error:", uploadError);
      return NextResponse.json({ error: "Failed to upload avatar" }, { status: 500, headers: { "Cache-Control": "no-store" } });
    }

    // Get public URL
    const { data: urlData } = supabaseAdmin.storage
      .from("avatars")
      .getPublicUrl(filename);

    const avatarUrl = urlData.publicUrl;

    // Update user metadata with avatar URL
    const { error: updateError } = await supabase.auth.updateUser({
      data: {
        avatar_url: avatarUrl,
      }
    });

    if (updateError) {
      console.error("Failed to update avatar URL:", updateError);
      // Try to delete uploaded file
      await supabaseAdmin.storage.from("avatars").remove([filename]);
      return NextResponse.json({ error: "Failed to update avatar" }, { status: 500, headers: { "Cache-Control": "no-store" } });
    }

    return NextResponse.json({
      avatar_url: avatarUrl,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Avatar POST error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}

export async function DELETE() {
  const supabase = await createServer();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }

  try {
    // Remove avatar from user metadata
    const { error: updateError } = await supabase.auth.updateUser({
      data: {
        avatar_url: null,
      }
    });

    if (updateError) {
      console.error("Failed to remove avatar:", updateError);
      return NextResponse.json({ error: "Failed to remove avatar" }, { status: 500, headers: { "Cache-Control": "no-store" } });
    }

    // Note: We don't delete the file from storage to avoid breaking existing references
    // In production, you might want to implement a cleanup job

    return NextResponse.json({ success: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Avatar DELETE error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}


