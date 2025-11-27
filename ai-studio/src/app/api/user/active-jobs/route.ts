import { NextRequest, NextResponse } from "next/server";
import { createServer } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const supabase = await createServer();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Fetch active jobs for the user
    const { data: jobs, error } = await supabase
      .from("jobs")
      .select(`
        id,
        model_id,
        row_id,
        status,
        created_at,
        model:models (
          id,
          name
        )
      `)
      .eq("user_id", user.id)
      .in("status", ["queued", "submitted", "running", "saving"])
      .order("created_at", { ascending: true })
      .limit(20);

    if (error) {
      console.error("[Active Jobs] Error:", error);
      return NextResponse.json(
        { error: "Failed to fetch active jobs" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      jobs: (jobs || []).map((job) => ({
        id: job.id,
        model_id: job.model_id,
        row_id: job.row_id,
        status: job.status,
        created_at: job.created_at,
        model: Array.isArray(job.model) ? job.model[0] : job.model,
      })),
    });
  } catch (error) {
    console.error("[Active Jobs] Unexpected error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

