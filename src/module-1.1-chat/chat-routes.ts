import type { Env } from '../env';
import { errorJson, json } from '../lib/http';
import { runGeminiConversation } from './providers/gemini';
import { runOpenAiCompatConversation } from './providers/openai-compat';
import type { ChatMessage, ChatProvider, McpTool, ToolCaller } from './types';

const OPENAI_BASE_URL = 'https://api.openai.com/v1';

interface ChatRequestBody {
  message?: unknown;
  history?: unknown;
  provider?: unknown;
  model?: unknown;
}

export function buildSystemPrompt(hasTools = false): string {
  return hasTools
    ? 'คุณคือผู้ช่วย AI ภาษาไทยที่สุภาพและมีประโยชน์ คุณสามารถใช้เครื่องมือที่ระบบมอบให้ และควรใช้เครื่องมือเมื่อจำเป็นก่อนตอบผู้ใช้'
    : 'คุณคือผู้ช่วย AI ส่วนตัวที่สุภาพและมีประโยชน์ ตอบผู้ใช้เป็นภาษาไทยเมื่อเหมาะสม หากไม่แน่ใจให้บอกตามตรง';
}

export function resolveProvider(value: unknown, env: Env): ChatProvider {
  const candidate = typeof value === 'string' ? value : env.DEFAULT_CHAT_PROVIDER;
  return candidate === 'openai' || candidate === 'openai-compat' || candidate === 'gemini' ? candidate : 'gemini';
}

export function defaultModelFor(provider: ChatProvider, env: Env): string {
  if (provider === 'gemini') return env.GEMINI_MODEL?.trim() || 'gemini-flash-latest';
  if (provider === 'openai') return env.OPENAI_MODEL?.trim() || 'gpt-4o-mini';
  return env.OPENAI_COMPAT_MODEL?.trim() || 'gpt-4o-mini';
}

async function resolveApiKey(env: Env, provider: ChatProvider): Promise<string | undefined> {
  if (provider === 'gemini') return env.GEMINI_API_KEY;
  if (provider === 'openai') return env.OPENAI_API_KEY;
  return env.OPENAI_COMPAT_API_KEY;
}

async function resolveBaseUrl(env: Env, provider: ChatProvider): Promise<string | undefined> {
  return provider === 'openai' ? OPENAI_BASE_URL : provider === 'openai-compat' ? env.OPENAI_COMPAT_BASE_URL : undefined;
}

async function resolveTools(_env: Env): Promise<{ tools: McpTool[]; callTool: ToolCaller }> {
  return {
    tools: [],
    callTool: async () => { throw new Error('ยังไม่มี MCP tools ใน Module 1.1'); },
  };
}

function parseHistory(value: unknown): ChatMessage[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is ChatMessage => {
    if (!item || typeof item !== 'object') return false;
    const message = item as Record<string, unknown>;
    return (message.role === 'user' || message.role === 'assistant') && typeof message.content === 'string';
  }).slice(-40);
}

export async function runChatTurn(params: {
  env: Env;
  provider: ChatProvider;
  model?: string;
  history: ChatMessage[];
}): Promise<{ reply: string; toolTraceCount: number }> {
  const provider = resolveProvider(params.provider, params.env);
  const model = params.model?.trim() || defaultModelFor(provider, params.env);
  const [apiKey, baseUrl, toolConfig] = await Promise.all([
    resolveApiKey(params.env, provider), resolveBaseUrl(params.env, provider), resolveTools(params.env),
  ]);
  const options = { apiKey, baseUrl, model, messages: params.history, systemPrompt: buildSystemPrompt(toolConfig.tools.length > 0), ...toolConfig };
  const result = provider === 'gemini'
    ? await runGeminiConversation(options)
    : await runOpenAiCompatConversation(options);
  return { reply: result.reply, toolTraceCount: result.toolTrace.length };
}

export async function handleChatRoute(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'POST') return errorJson('รองรับเฉพาะ POST สำหรับ endpoint นี้', 405);
  let body: ChatRequestBody;
  try { body = await request.json() as ChatRequestBody; } catch { return errorJson('รูปแบบ JSON ไม่ถูกต้อง', 400); }
  if (typeof body.message !== 'string' || !body.message.trim()) return errorJson('กรุณาระบุ message เป็นข้อความที่ไม่ว่าง', 400);

  const provider = resolveProvider(body.provider, env);
  const model = typeof body.model === 'string' && body.model.trim() ? body.model.trim() : defaultModelFor(provider, env);
  const history = [...parseHistory(body.history), { role: 'user' as const, content: body.message.trim() }];
  const [apiKey, baseUrl, toolConfig] = await Promise.all([
    resolveApiKey(env, provider), resolveBaseUrl(env, provider), resolveTools(env),
  ]);
  const result = provider === 'gemini'
    ? await runGeminiConversation({ apiKey, model, messages: history, systemPrompt: buildSystemPrompt(false), ...toolConfig })
    : await runOpenAiCompatConversation({ apiKey, baseUrl, model, messages: history, systemPrompt: buildSystemPrompt(false), ...toolConfig });

  return json({ reply: result.reply, provider, model, toolTrace: result.toolTrace });
}