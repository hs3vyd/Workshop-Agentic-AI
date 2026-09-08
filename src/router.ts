import type { Env } from './env';
import { errorJson, json } from './lib/http';
import { handleChatRoute } from './module-1.1-chat/chat-routes';

export async function route(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname === '/api/chat') return handleChatRoute(request, env);
  if (url.pathname === '/healthz') return json({ ok: true });
  if (env.ASSETS) return env.ASSETS.fetch(request);
  return errorJson('ไม่พบเส้นทางที่ร้องขอ', 404);
}