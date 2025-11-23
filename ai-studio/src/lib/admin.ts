import { createServer } from '@/lib/supabase-server';

/**
 * Check if the current user is an admin
 * This function queries the database to verify admin status
 */
export async function isAdminUser(): Promise<boolean> {
  try {
    const supabase = await createServer();
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return false;
    }
    
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('is_admin')
      .eq('user_id', user.id)
      .single();
    
    if (error || !profile) {
      return false;
    }
    
    return profile.is_admin === true;
  } catch (error) {
    console.error('[Admin] Error checking admin status:', error);
    return false;
  }
}

/**
 * Get admin user ID from email
 * Useful for admin operations
 */
export async function getAdminUserId(email: string): Promise<string | null> {
  try {
    const supabase = await createServer();
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user || user.email !== email) {
      return null;
    }
    
    const isAdmin = await isAdminUser();
    return isAdmin ? user.id : null;
  } catch (error) {
    console.error('[Admin] Error getting admin user ID:', error);
    return null;
  }
}

