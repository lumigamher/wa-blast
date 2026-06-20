export type LlmMessage =
  | { role: "user"; content: string }
  | { role: "assistant"; content: string | null; toolCalls?: LlmToolCall[] }
  | { role: "tool"; toolCallId: string; content: string };

export type LlmToolSchema = {
  name: string;
  description: string;
  /** JSON Schema de los parámetros */
  parameters: Record<string, unknown>;
};

export type LlmToolCall = { id: string; name: string; argsJson: string };

export type LlmUsage = { promptTokens: number; completionTokens: number };

export type LlmResponse = {
  text: string | null;
  toolCalls: LlmToolCall[];
  usage: LlmUsage;
};

export interface LlmProvider {
  chat(input: {
    system: string;
    messages: LlmMessage[];
    tools: LlmToolSchema[];
    temperature: number;
    model: string;
  }): Promise<LlmResponse>;
}
