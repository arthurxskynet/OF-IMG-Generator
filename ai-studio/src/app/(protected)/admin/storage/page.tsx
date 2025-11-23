import { redirect } from 'next/navigation';
import { createServer } from '@/lib/supabase-server';
import { isAdminUser } from '@/lib/admin';
import { StorageGallery } from '@/components/admin/storage-gallery';

export const dynamic = 'force-dynamic';

export default async function AdminStoragePage() {
  const supabase = await createServer();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const isAdmin = await isAdminUser();
  if (!isAdmin) {
    redirect('/dashboard');
  }

  return <StorageGallery />;
}

