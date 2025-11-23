import { redirect } from 'next/navigation';
import { createServer } from '@/lib/supabase-server';
import { isAdminUser } from '@/lib/admin';
import { AdminDashboard } from '@/components/admin/admin-dashboard';

export const dynamic = 'force-dynamic';

export default async function AdminPage() {
  const supabase = await createServer();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const isAdmin = await isAdminUser();
  if (!isAdmin) {
    redirect('/dashboard');
  }

  return <AdminDashboard />;
}

