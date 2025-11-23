import { NextRequest, NextResponse } from 'next/server';
import { isAdminUser } from './admin';

/**
 * Middleware to verify admin status for API routes
 * Returns 403 if user is not admin
 */
export async function requireAdmin(req: NextRequest): Promise<NextResponse | null> {
  const isAdmin = await isAdminUser();
  
  if (!isAdmin) {
    return NextResponse.json(
      { error: 'Forbidden: Admin access required' },
      { status: 403 }
    );
  }
  
  return null; // User is admin, continue
}

/**
 * Wrapper for API route handlers that require admin access
 */
export function withAdmin<T extends (...args: any[]) => Promise<NextResponse>>(
  handler: T
): T {
  return (async (...args: Parameters<T>) => {
    const req = args[0] as NextRequest;
    const forbidden = await requireAdmin(req);
    
    if (forbidden) {
      return forbidden;
    }
    
    return handler(...args);
  }) as T;
}

