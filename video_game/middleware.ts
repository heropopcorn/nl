import { next } from '@vercel/functions';
import { createAuth } from './server/auth.mjs';

export const config = { runtime: 'nodejs', matcher: '/:path*' };
const auth = createAuth({ secret: process.env.AUTH_SECRET, username: process.env.ADMIN_USERNAME || 'admin', passwordHash: process.env.ADMIN_PASSWORD_HASH });

export default async function middleware(request: Request) {
  return await auth(request) || next();
}
