import { next } from '@vercel/functions';
import { createAuth } from './server/auth.mjs';
import { isReviewBotRead } from './server/review-access.mjs';

export const config = { runtime: 'nodejs', matcher: '/:path*' };
const auth = createAuth({ secret: process.env.AUTH_SECRET, username: process.env.ADMIN_USERNAME || 'admin', passwordHash: process.env.ADMIN_PASSWORD_HASH });

export default async function middleware(request: Request) {
  // Scope this bypass to an authenticated, read-only review result endpoint.
  if (isReviewBotRead(request)) return next();
  return await auth(request) || next();
}
