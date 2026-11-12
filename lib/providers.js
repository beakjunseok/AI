// AI//OFFICE 서버리스 공통 모듈: 공급자 카탈로그, 호출, 오류 표준화, 접속 코드 검사.
// API 키는 Vercel 환경변수에서만 읽고 응답에는 절대 포함하지 않는다.
const crypto = require("crypto");

const REQUEST_TIMEOUT_MS = 25000;
const MAX_OUTPUT_TOKENS = 700;
const MAX_PROMPT_CHARACTERS = 30000; // 브리프·초기 코드 프롬프트(코드 첨부 포함)가 잘리지 않게

// 페이지에 내려주는 공급자 정보(키 제외). 새 AI는 여기와 PROVIDERS에만 추가하면 페이지 수정 없이 붙는다.
const CATALOG = {
  gemini: { label: "Gemini", color: "#4285f4", rank: "서브", strengths: "비주얼/디자인 감각 · 이미지 이해(멀티모달) · 긴 문맥 · 빠른 Flash", duty: "디자인 담당 + 대타 1순위",
    daily: 250, perMinute: 10, resetZone: "America/Los_Angeles", source: "AI Studio 무료 · 하루 한도는 태평양 자정 리셋 (참고치)" },
  gpt: { label: "GPT-OSS", color: "#10a37f", rank: "크리에이티브", strengths: "아이디어 발산 · 카피/네이밍 · 빠른 응답 (OpenAI 공개 모델, Groq 무료)", duty: "크리에이티브 전담",
    daily: 1000, perMinute: 30, resetZone: "UTC", source: "Groq 무료 · 하루 20만 토큰 · 리셋 시각 추정" }
};

class ProviderError extends Error {
  constructor(code, message, status) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

const readSetting = (name, fallback = "") => (process.env[name] || fallback).trim();

// 타임아웃이 걸린 fetch. 네트워크 실패도 ProviderError로 바꿔 한 가지 방식으로 처리한다.
async function fetchWithTimeout(url, options) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (error.name === "AbortError") throw new ProviderError("upstream_error", "공급자 응답 시간 초과", 504);
    throw new ProviderError("upstream_error", `네트워크 오류: ${error.name}`, 502);
  } finally {
    clearTimeout(timer);
  }
}

const postJson = (url, body, headers) => fetchWithTimeout(url, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) });

// 공급자 HTTP 상태를 공통 오류로 변환. 429는 페이지가 다음 대타로 넘어가도록 rate_limited.
async function readOrThrow(response, label) {
  if (response.ok) return response.json();
  const detail = (await response.text().catch(() => "")).slice(0, 200);
  if (response.status === 429) throw new ProviderError("rate_limited", `${label} 무료 한도 초과`, 429);
  if (response.status === 401 || response.status === 403) throw new ProviderError("not_configured", `${label} 키가 거부됨`, 503);
  if (response.status === 404) throw new ProviderError("upstream_error", `${label} 모델을 찾을 수 없음: ${detail}`, 502);
  throw new ProviderError("upstream_error", `${label} 오류 ${response.status}: ${detail}`, 502);
}

// OpenAI Chat Completions 호환 공급자 공통 호출.
async function callOpenAICompatible({ label, url, apiKey, model, prompt, maxTokens, extraBody = {} }) {
  const response = await postJson(url, { model, messages: [{ role: "user", content: prompt }], max_tokens: maxTokens, temperature: 0.8, ...extraBody },
    { Authorization: `Bearer ${apiKey}` });
  const data = await readOrThrow(response, label);
  const text = (data.choices?.[0]?.message?.content || "").trim();
  if (!text) throw new ProviderError("upstream_error", `${label} 빈 응답`, 502);
  return text;
}

function requireKey(envName) {
  const key = readSetting(envName);
  if (!key) throw new ProviderError("not_configured", `${envName} 없음`, 503);
  return key;
}

function buildGeminiConfig(model, maxTokens) {
  const config = { maxOutputTokens: maxTokens, temperature: 0.8 };
  const thinkingLevel = readSetting("GEMINI_THINKING_LEVEL");
  if (model.includes("2.5")) config.thinkingConfig = { thinkingBudget: 0 };
  else if (thinkingLevel) config.thinkingConfig = { thinkingLevel };
  return config;
}

async function callGemini(prompt, maxTokens = MAX_OUTPUT_TOKENS) {
  const apiKey = requireKey("GEMINI_API_KEY");
  const model = readSetting("GEMINI_MODEL", "gemini-3.5-flash-lite");
  const response = await postJson(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    { contents: [{ role: "user", parts: [{ text: prompt }] }], generationConfig: buildGeminiConfig(model, maxTokens) },
    { "x-goog-api-key": apiKey });
  const data = await readOrThrow(response, "Gemini");
  const parts = data.candidates?.[0]?.content?.parts || [];
  const text = parts.filter(part => !part.thought).map(part => part.text || "").join("").trim();
  if (!text) throw new ProviderError("upstream_error", `Gemini 빈 응답 (${data.candidates?.[0]?.finishReason || "이유 불명"})`, 502);
  return text;
}

async function callGroq(prompt, maxTokens = MAX_OUTPUT_TOKENS) {
  return callOpenAICompatible({ label: "Groq", url: "https://api.groq.com/openai/v1/chat/completions", apiKey: requireKey("GROQ_API_KEY"),
    model: readSetting("GROQ_MODEL", "openai/gpt-oss-120b"), prompt, maxTokens, extraBody: { reasoning_effort: "low" } });
}

// 페이지의 모델 키 → [환경변수 이름, 호출 함수]
const PROVIDERS = {
  gemini: ["GEMINI_API_KEY", callGemini],
  gpt: ["GROQ_API_KEY", callGroq]
};

const configuredProviders = () => Object.keys(PROVIDERS).filter(name => readSetting(PROVIDERS[name][0]));

// ACCESS_CODE가 있으면 x-access-code 헤더 일치 필요. 해시 후 상수 시간 비교.
function hasAccess(request) {
  const expected = readSetting("ACCESS_CODE");
  if (!expected) return true;
  const given = String(request.headers["x-access-code"] || "");
  const expectedHash = crypto.createHash("sha256").update(expected).digest();
  const givenHash = crypto.createHash("sha256").update(given).digest();
  return crypto.timingSafeEqual(expectedHash, givenHash);
}

function sendError(response, error) {
  if (error instanceof ProviderError) return response.status(error.status).json({ code: error.code, message: error.message });
  return response.status(500).json({ code: "upstream_error", message: "서버 내부 오류" });
}

module.exports = { CATALOG, PROVIDERS, ProviderError, configuredProviders, hasAccess, sendError, readSetting, MAX_PROMPT_CHARACTERS };
