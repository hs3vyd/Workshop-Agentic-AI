import { toGeminiSchema } from '../tool-schema';
import type { ChatMessage, ChatTurnResult, McpTool, ToolCaller, ToolTraceEntry } from '../types';

interface GeminiOptions {
  apiKey?: string;
  model: string;
  messages: ChatMessage[];
  systemPrompt: string;
  tools: McpTool[];
  callTool: ToolCaller;
}

interface GeminiPart {
  text?: string;
  functionCall?: { name: string; args?: Record<string, unknown> };
}

function missingKeyMessage(): ChatTurnResult {
  return { reply: 'ยังไม่ได้ตั้งค่า Gemini API key กรุณาตั้งค่า GEMINI_API_KEY ก่อนใช้งาน', toolTrace: [] };
}

export async function runGeminiConversation(options: GeminiOptions): Promise<ChatTurnResult> {
  if (!options.apiKey?.trim()) return missingKeyMessage();

  const contents: Array<{ role: 'user' | 'model'; parts: GeminiPart[] }> = options.messages.map((message) => ({
    role: message.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: message.content }],
  }));
  const toolTrace: ToolTraceEntry[] = [];

  for (let round = 0; round < 4; round += 1) {
    const body: Record<string, unknown> = {
      systemInstruction: { parts: [{ text: options.systemPrompt }] },
      contents,
      generationConfig: { temperature: 0.7 },
    };
    if (options.tools.length > 0) {
      body.tools = [{ functionDeclarations: options.tools.map((tool) => ({
        name: `${tool.serverId}__${tool.name}`,
        description: tool.description || tool.name,
        parameters: toGeminiSchema(tool.inputSchema || { type: 'object', properties: {} }),
      })) }];
    }

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(options.model)}:generateContent?key=${encodeURIComponent(options.apiKey)}`,
      { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) },
    );
    if (!response.ok) return { reply: `Gemini API ตอบกลับผิดพลาด (${response.status}) กรุณาตรวจสอบ API key และ model`, toolTrace };

    const data = await response.json() as {
      candidates?: Array<{ content?: { parts?: GeminiPart[] } }>;
    };
    const parts = data.candidates?.[0]?.content?.parts || [];
    const calls = parts.filter((part) => part.functionCall?.name);
    const text = parts.map((part) => part.text || '').join('').trim();
    if (calls.length === 0) return { reply: text || 'โมเดลไม่ส่งข้อความตอบกลับ', toolTrace };

    const functionResponses: GeminiPart[] = [];
    contents.push({ role: 'model', parts });
    for (const call of calls) {
      const name = call.functionCall!.name;
      const separator = name.indexOf('__');
      const serverId = separator >= 0 ? name.slice(0, separator) : name;
      const toolName = separator >= 0 ? name.slice(separator + 2) : name;
      const args = call.functionCall!.args || {};
      try {
        const result = await options.callTool(serverId, toolName, args);
        toolTrace.push({ serverId, toolName, arguments: args, result });
        functionResponses.push({ text: JSON.stringify({ name, result }) });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'เรียกใช้ tool ไม่สำเร็จ';
        toolTrace.push({ serverId, toolName, arguments: args, error: message });
        functionResponses.push({ text: JSON.stringify({ name, error: message }) });
      }
    }
    contents.push({ role: 'user', parts: functionResponses });
  }

  return { reply: 'การเรียกใช้เครื่องมือใช้เวลานานเกินไป กรุณาลองใหม่อีกครั้ง', toolTrace };
}