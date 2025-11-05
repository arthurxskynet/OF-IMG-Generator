import { createServer } from '@/lib/supabase-server'

const Page = async () => {
  const supabase = await createServer()
  const { data: { user } } = await supabase.auth.getUser()
  let generationCount = 0
  let lastGeneratedAt: string | null = null
  if (user) {
    const { data } = await supabase
      .from('user_usage')
      .select('generation_count, last_generated_at')
      .eq('user_id', user.id)
      .single()
    generationCount = data?.generation_count ?? 0
    lastGeneratedAt = data?.last_generated_at ?? null
  }
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Manage your AI Studio account preferences and workspace defaults.
        </p>
      </div>
      <section className="grid gap-4 md:grid-cols-2">
        <article className="rounded-lg border bg-card p-6 text-card-foreground shadow-sm">
          <h2 className="text-lg font-semibold">Usage</h2>
          <div className="mt-2 text-sm">
            <div className="text-muted-foreground">Total generations</div>
            <div className="text-2xl font-semibold">{generationCount}</div>
            {lastGeneratedAt && (
              <div className="mt-1 text-xs text-muted-foreground">Last generated at: {new Date(lastGeneratedAt).toLocaleString()}</div>
            )}
          </div>
        </article>
        <article className="rounded-lg border bg-card p-6 text-card-foreground shadow-sm">
          <h2 className="text-lg font-semibold">Profile</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Update your personal details, avatar, and contact information. Coming soon.
          </p>
        </article>
        <article className="rounded-lg border bg-card p-6 text-card-foreground shadow-sm">
          <h2 className="text-lg font-semibold">Notifications</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Configure reminders, job completions, and product updates. Coming soon.
          </p>
        </article>
        <article className="rounded-lg border bg-card p-6 text-card-foreground shadow-sm md:col-span-2">
          <h2 className="text-lg font-semibold">Security</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Manage API tokens, connected providers, and sign-in methods. Coming soon.
          </p>
        </article>
      </section>
    </div>
  );
};

export default Page;

