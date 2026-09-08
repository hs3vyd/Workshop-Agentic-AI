export type ChatProvider = 'gemini' | 'openai' | 'openai-compat';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface McpTool {
  serverId: string;
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

export interface ToolTraceEntry {
  serverId: string;
  toolName: string;
  arguments: Record<string, unknown>;
  result?: unknown;
  error?: string;
}

export interface ChatTurnResult {
  reply: string;
  toolTrace: ToolTraceEntry[];
}

export type ToolCaller = (
  serverId: string,
  toolName: string,
  args: Record<string, unknown>,
) => Promise<unknown>;

export function toolFunctionName(serverId: string, toolName: string): string {
  return `${serverId}__${toolName}`;
}