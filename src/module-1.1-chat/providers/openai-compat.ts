import type { ChatMessage, ChatTurnResult, McpTool, ToolCaller, ToolTraceEntry } from '../types';

interface OpenAiOptions {
  apiKey?: string;
  baseUrl?: string;
  model: string;
  messages: ChatMessage[];
  systemPrompt: string;
  tools: McpTool[];
  callTool: ToolCaller;
}

interface OpenAiToolCall {
  id: string;
  function: { name: string; arguments: string };
}

function missingConfigMessage(baseUrl?: string, apiKey?: string): string {
  if (!apiKey?.trim()) return 'ยังไม่ได้ตั้งค่า API key ของ provider นี้ กรุณาตั้งค่า key ก่อนใช้งาน';
  if (!baseUrl?.trim()) return 'ยังไม่ได้ตั้งค่า base URL ของ AI gateway กรุณาตั้งค่า OPENAI_COMPAT_BASE_URL ก่อนใช้งาน';
  return '';
}

export async function runOpenAiCompatConversation(options: OpenAiOptions): Promise<ChatTurnResult> {
  const missing = missingConfigMessage(options.baseUrl, options.apiKey);
  if (missing) return { reply: missing, toolTrace: [] };

  const baseUrl = options.baseUrl!.replace(/\/+$/, '');
  const messages: Array<Record<string, unknown>> = [
    { role: 'system', content: options.systemPrompt },
    ...options.messages.map((message) => ({ role: message.role, content: message.content })),
  ];
  const toolTrace: ToolTraceEntry[] = [];

  for (let round = 0; round < 4; round += 1) {
    const body: Record<string, unknown> = { model: options.model, messages, temperature: 0.7 };
    if (options.tools.length > 0) {
      body.tools = options.tools.map((tool) => ({ type: 'function', function: {
        name: `${tool.serverId}__${tool.name}`,
        description: tool.description || tool.name,
        parameters: tool.inputSchema || { type: 'object', properties: {} },
      } }));
      body.tool_choice = 'auto';
    }

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${options.apiKey}` },
      body: JSON.stringify(body),
    });
    if (!response.ok) return { reply: `AI provider ตอบกลับผิดพลาด (${response.status}) กรุณาตรวจสอบการตั้งค่า`, toolTrace };

    const data = await response.json() as { choices?: Array<{ message?: { content?: string; tool_calls?: OpenAiToolCall[] } }> };
    const message = data.choices?.[0]?.message;
    if (!message) return { reply: 'AI provider ไม่ส่งข้อความตอบกลับ', toolTrace };
    const calls = message.tool_calls || [];
    messages.push({ role: 'assistant', content: message.content || null, ...(calls.length ? { tool_calls: calls } : {}) });
    if (calls.length === 0) return { reply: message.content?.trim() || 'โมเดลไม่ส่งข้อความตอบกลับ', toolTrace };

    for (const call of calls) {
      const separator = call.function.name.indexOf('__');
      const serverId = separator >= 0 ? call.function.name.slice(0, separator) : call.function.name;
      const toolName = separator >= 0 ? call.function.name.slice(separator + 2) : call.function.name;
      let args: Record<string, unknown> = {};
      try { args = JSON.parse(call.function.arguments || '{}') as Record<string, unknown>; } catch { /* provider supplied invalid JSON */ }
      try {
        const result = await options.callTool(serverId, toolName, args);
        toolTrace.push({ serverId, toolName, arguments: args, result });
        messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(result) });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'เรียกใช้ tool ไม่สำเร็จ';
        toolTrace.push({ serverId, toolName, arguments: args, error: errorMessage });
        messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify({ error: errorMessage }) });
      }
    }
  }

  return { reply: 'การเรียกใช้เครื่องมือใช้เวลานานเกินไป กรุณาลองใหม่อีกครั้ง', toolTrace };
}