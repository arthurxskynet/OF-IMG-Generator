'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase-browser';

export function useAdmin() {
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    const checkAdmin = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        
        if (!user) {
          setIsAdmin(false);
          setLoading(false);
          return;
        }

        const { data: profile, error } = await supabase
          .from('profiles')
          .select('is_admin')
          .eq('user_id', user.id)
          .single();

        if (error || !profile) {
          setIsAdmin(false);
        } else {
          setIsAdmin(profile.is_admin === true);
        }
      } catch (error) {
        console.error('[useAdmin] Error checking admin status:', error);
        setIsAdmin(false);
      } finally {
        setLoading(false);
      }
    };

    checkAdmin();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      checkAdmin();
    });

    return () => subscription.unsubscribe();
  }, [supabase]);

  return { isAdmin, loading };
}

