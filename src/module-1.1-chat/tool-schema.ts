const GEMINI_TYPES = new Set(['OBJECT', 'ARRAY', 'STRING', 'NUMBER', 'INTEGER', 'BOOLEAN', 'NULL']);

export function toGeminiSchema(schema: unknown): Record<string, unknown> {
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) return {};

  const source = schema as Record<string, unknown>;
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(source)) {
    if (key === 'type' && typeof value === 'string') {
      const upper = value.toUpperCase();
      result[key] = GEMINI_TYPES.has(upper) ? upper : upper;
    } else if (key === 'properties' && value && typeof value === 'object' && !Array.isArray(value)) {
      result[key] = Object.fromEntries(
        Object.entries(value as Record<string, unknown>).map(([name, child]) => [name, toGeminiSchema(child)]),
      );
    } else if (key === 'items') {
      result[key] = toGeminiSchema(value);
    } else {
      result[key] = value;
    }
  }

  return result;
}