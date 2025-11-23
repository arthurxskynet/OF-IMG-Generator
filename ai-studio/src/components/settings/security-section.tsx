"use client";

import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { ChangePasswordDialog } from "./change-password-dialog";
import { Shield, Key, Mail } from "lucide-react";

interface AuthProvider {
  id: string;
  type: string;
  email: string;
  verified: boolean;
}

interface SecuritySectionProps {
  initialProviders: AuthProvider[];
}

export function SecuritySection({ initialProviders }: SecuritySectionProps) {
  const [providers, setProviders] = useState<AuthProvider[]>(initialProviders);
  const [showPasswordDialog, setShowPasswordDialog] = useState(false);
  const { toast } = useToast();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Security</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Manage API tokens, connected providers, and sign-in methods.
        </p>
      </div>

      <div className="space-y-6">
        {/* Password Change */}
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <Key className="size-5 text-muted-foreground" />
            <div className="flex-1">
              <h3 className="font-medium">Password</h3>
              <p className="text-sm text-muted-foreground">
                Change your account password to keep your account secure.
              </p>
            </div>
            <Button variant="outline" onClick={() => setShowPasswordDialog(true)}>
              Change Password
            </Button>
          </div>
        </div>

        {/* Connected Providers */}
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <Shield className="size-5 text-muted-foreground" />
            <div className="flex-1">
              <h3 className="font-medium">Connected Providers</h3>
              <p className="text-sm text-muted-foreground">
                Manage your connected authentication providers.
              </p>
            </div>
          </div>
          <div className="space-y-2">
            {providers.map((provider) => (
              <div
                key={provider.id}
                className="flex items-center justify-between rounded-lg border p-4"
              >
                <div className="flex items-center gap-3">
                  <Mail className="size-4 text-muted-foreground" />
                  <div>
                    <p className="font-medium">{provider.email}</p>
                    <p className="text-sm text-muted-foreground">
                      {provider.type} {provider.verified ? "• Verified" : "• Unverified"}
                    </p>
                  </div>
                </div>
                {provider.verified && (
                  <span className="text-xs text-muted-foreground">Active</span>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* API Tokens - Placeholder for future */}
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <Key className="size-5 text-muted-foreground" />
            <div className="flex-1">
              <h3 className="font-medium">API Tokens</h3>
              <p className="text-sm text-muted-foreground">
                Manage API tokens for programmatic access. Coming soon.
              </p>
            </div>
          </div>
        </div>
      </div>

      <ChangePasswordDialog
        open={showPasswordDialog}
        onOpenChange={setShowPasswordDialog}
      />
    </div>
  );
}

