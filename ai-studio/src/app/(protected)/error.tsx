"use client";
interface ErrorProps { error: Error & { digest?: string }; reset: () => void }

const Error = ({ error, reset }: ErrorProps) => {
  return (
    <div className="p-6 flex items-center justify-center">
      <div className="w-full max-w-md rounded-xl border bg-card p-6 shadow-sm">
        <div className="space-y-3">
          <h2 className="text-lg font-semibold">Something went wrong</h2>
          <p className="text-sm text-muted-foreground">An unexpected error occurred. You can retry or return later.</p>
          {error?.message ? (
            <details className="rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground">
              <summary className="cursor-pointer">Details</summary>
              <pre className="mt-2 whitespace-pre-wrap break-words">{error.message}</pre>
            </details>
          ) : null}
          <div className="flex gap-3 pt-2">
            <button onClick={reset} className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              Try again
            </button>
            <a href="/dashboard" className="inline-flex h-9 items-center justify-center rounded-md border bg-background px-4 text-sm font-medium hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              Go to dashboard
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Error;


