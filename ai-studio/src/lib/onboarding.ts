import { supabaseAdmin } from "@/lib/supabase-admin";

export const ensureUserOnboarding = async (userId: string) => {
  // Ensure profile exists
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (!profile) {
    await supabaseAdmin.from("profiles").insert({ user_id: userId });
  }

  // Ensure at least one team exists with membership
  const { data: existingMemberships } = await supabaseAdmin
    .from("team_members")
    .select("team_id")
    .eq("user_id", userId)
    .limit(1);

  if (!existingMemberships || existingMemberships.length === 0) {
    const teamName = "My Team";
    const { data: team, error: teamError } = await supabaseAdmin
      .from("teams")
      .insert({ name: teamName, owner_id: userId })
      .select("id")
      .single();
    if (!teamError && team) {
      await supabaseAdmin.from("team_members").insert({ team_id: team.id, user_id: userId, role: "owner" });
    }
  }
};


