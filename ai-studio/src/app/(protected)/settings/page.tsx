const Page = async () => {
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

