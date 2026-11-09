// POST /api/chat  {provider, prompt, maxTokens?} → {text}. maxTokens는 200~2000으로 제한.
const { PROVIDERS, configuredProviders, hasAccess, sendError, MAX_PROMPT_CHARACTERS } = require("../lib/providers");

const MIN_OUTPUT_LIMIT = 200;
const MAX_OUTPUT_LIMIT = 2000;

module.exports = async (request, response) => {
  response.setHeader("Cache-Control", "no-store");
  if (request.method !== "POST") return response.status(405).json({ code: "bad_request", message: "POST만 가능" });
  if (!hasAccess(request)) return response.status(401).json({ code: "locked", message: "접속 코드가 필요해요" });

  const body = typeof request.body === "string" ? safeParse(request.body) : (request.body || {});
  const { provider } = body;
  let { prompt } = body;
  if (!PROVIDERS[provider]) return response.status(400).json({ code: "bad_request", message: "알 수 없는 provider" });
  if (!configuredProviders().includes(provider)) return response.status(503).json({ code: "not_configured", message: `${provider} 키가 설정되지 않음` });
  if (typeof prompt !== "string" || !prompt.trim()) return response.status(400).json({ code: "bad_request", message: "prompt가 비었어요" });
  if (prompt.length > MAX_PROMPT_CHARACTERS) prompt = prompt.slice(0, MAX_PROMPT_CHARACTERS);
  const requestedTokens = Number(body.maxTokens);
  const maxTokens = Number.isFinite(requestedTokens) ? Math.min(MAX_OUTPUT_LIMIT, Math.max(MIN_OUTPUT_LIMIT, Math.round(requestedTokens))) : undefined;

  try {
    const text = await PROVIDERS[provider][1](prompt, maxTokens);
    return response.status(200).json({ text: text || "(빈 답장)" });
  } catch (error) {
    return sendError(response, error);
  }
};

function safeParse(raw) {
  try { return JSON.parse(raw); } catch (error) { return {}; }
}
