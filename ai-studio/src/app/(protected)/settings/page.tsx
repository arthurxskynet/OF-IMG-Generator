import { createServer } from '@/lib/supabase-server'
import { ProfileSection } from '@/components/settings/profile-section'
import { NotificationsSection } from '@/components/settings/notifications-section'
import { SecuritySection } from '@/components/settings/security-section'

const Page = async () => {
  const supabase = await createServer()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
          <p className="text-sm text-muted-foreground">
            Please sign in to access your settings.
          </p>
        </div>
      </div>
    )
  }

  // Fetch usage data
  let generationCount = 0
  let lastGeneratedAt: string | null = null
  const { data: usageData } = await supabase
    .from('user_usage')
    .select('generation_count, last_generated_at')
    .eq('user_id', user.id)
    .maybeSingle()
  
  generationCount = usageData?.generation_count ?? 0
  lastGeneratedAt = usageData?.last_generated_at ?? null

  // Fetch profile data directly from database
  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('user_id', user.id)
    .maybeSingle()

  const profileData = {
    email: user.email || '',
    full_name: profile?.full_name || user.user_metadata?.full_name || '',
    avatar_url: user.user_metadata?.avatar_url || null,
  }

  // Fetch notification settings
  const { data: settingsData } = await supabase
    .from('user_settings')
    .select('email_notifications, job_completion_notifications, product_updates, reminders_enabled')
    .eq('user_id', user.id)
    .maybeSingle()

  const notificationSettings = {
    email_notifications: settingsData?.email_notifications ?? true,
    job_completion_notifications: settingsData?.job_completion_notifications ?? true,
    product_updates: settingsData?.product_updates ?? true,
    reminders_enabled: settingsData?.reminders_enabled ?? false,
  }

  // Auth providers - construct from user data
  const authProviders = [
    {
      id: 'email',
      type: 'email',
      email: user.email || '',
      verified: user.email_confirmed_at !== null,
    }
  ]

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
          <ProfileSection initialData={profileData} />
        </article>
        <article className="rounded-lg border bg-card p-6 text-card-foreground shadow-sm">
          <NotificationsSection initialData={notificationSettings} />
        </article>
        <article className="rounded-lg border bg-card p-6 text-card-foreground shadow-sm md:col-span-2">
          <SecuritySection initialProviders={authProviders} />
        </article>
      </section>
    </div>
  );
};

export default Page;

