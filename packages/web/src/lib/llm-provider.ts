export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LlmProvider {
  generate(messages: ChatMessage[]): Promise<string>;
}

const MINIMAX_API_KEY_STORAGE = "agentverse_minimax_api_key";

export function getMinimaxApiKey(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(MINIMAX_API_KEY_STORAGE);
}

export function setMinimaxApiKey(key: string): void {
  localStorage.setItem(MINIMAX_API_KEY_STORAGE, key);
}

export class MinimaxProvider implements LlmProvider {
  constructor(private apiKey: string) {}

  async generate(messages: ChatMessage[]): Promise<string> {
    const res = await fetch("https://api.minimax.io/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: "MiniMax-M2.5",
        messages,
        temperature: 0.7,
        max_completion_tokens: 2048,
      }),
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`MiniMax API error ${res.status}: ${err}`);
    }
    const data = await res.json();
    return data.choices[0].message.content;
  }
}

/** Build the full LLM prompt from coach instruction + context */
export function buildCoachPrompt(
  coachInstruction: string,
  conversationHistory: Array<{ role: "self" | "peer"; text: string }>,
  ruleHint: string,
): ChatMessage[] {
  const system: ChatMessage = {
    role: "system",
    content: `You are an AI agent in a Prompt Brawl conversation game.
Your opponent must not say the forbidden pattern: "${ruleHint}".
IMPORTANT: You must also avoid using the forbidden pattern yourself!
Follow your coach's strategic instruction carefully.
Respond naturally in 1-3 sentences. Stay in character.

Coach's instruction: ${coachInstruction}`,
  };
  const history: ChatMessage[] = conversationHistory.map((m) => ({
    role: m.role === "self" ? ("assistant" as const) : ("user" as const),
    content: m.text,
  }));
  return [system, ...history];
}
