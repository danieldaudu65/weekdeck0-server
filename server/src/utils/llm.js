'use strict';

/**
 * One place to talk to an AI. Google Gemini (free tier, and the only one here
 * that can search Google for real events) or Anthropic Claude. Keys stay on
 * the server.
 */
const { env } = require('../config/env');

const GEMINI = 'https://generativelanguage.googleapis.com/v1beta';

const providers = () => ({
  text: env.geminiKey ? 'gemini' : env.anthropicKey ? 'anthropic' : null,
  search: env.geminiKey ? 'gemini' : null,
});

class AiError extends Error {}

const okUrl = (u) => typeof u === 'string' && /^https?:\/\//i.test(u) && u.length < 2000;

/** Reads Gemini's newer Interactions response: text, cited links, and the Google search-suggestions chip. */
function readInteraction(data) {
  let text = typeof data.output_text === 'string' ? data.output_text : '';
  const sources = [];
  let suggestionsHtml = '';
  for (const step of Array.isArray(data.steps) ? data.steps : []) {
    if (step.type === 'model_output' && Array.isArray(step.content)) {
      for (const block of step.content) {
        if (block.type !== 'text') continue;
        if (!data.output_text) text += block.text || '';
        for (const a of block.annotations || []) if (a.type === 'url_citation' && okUrl(a.url)) sources.push({ url: a.url, title: String(a.title || '').slice(0, 160) });
      }
    }
    if (step.type === 'google_search_result') {
      for (const r of Array.isArray(step.result) ? step.result : [step.result]) {
        if (!suggestionsHtml && r && typeof r.search_suggestions === 'string') suggestionsHtml = r.search_suggestions;
      }
    }
  }
  return { text, sources, suggestionsHtml };
}

/** Reads the classic generateContent response (used if the Interactions endpoint isn't available). */
function readGenerate(data) {
  const cand = (data.candidates || [])[0] || {};
  const text = ((cand.content && cand.content.parts) || []).map((p) => p.text || '').join('');
  const meta = cand.groundingMetadata || {};
  const sources = (meta.groundingChunks || []).map((c) => c.web).filter((w) => w && okUrl(w.uri)).map((w) => ({ url: w.uri, title: String(w.title || '').slice(0, 160) }));
  const suggestionsHtml = (meta.searchEntryPoint && meta.searchEntryPoint.renderedContent) || '';
  return { text, sources, suggestionsHtml };
}

function dedupe(sources) {
  const seen = new Set();
  return sources.filter((s) => (seen.has(s.url) ? false : (seen.add(s.url), true))).slice(0, 12);
}

async function post(url, headers, body, ms) {
  const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body), signal: AbortSignal.timeout(ms) });
  const data = await r.json().catch(() => ({}));
  return { status: r.status, ok: r.ok, data };
}

/** Google's own reason, e.g. "Quota exceeded ... limit: 0, model: gemini-x". */
const googleReason = (data) => String((data && data.error && (data.error.message || data.error.status)) || '').slice(0, 300);

/**
 * Free keys don't cover every model (Google may give a model a free limit of 0),
 * so try the chosen model first, then older free-tier models.
 */
function geminiModels() {
  const fallbacks = (env.geminiFallbacks || []).filter(Boolean);
  return [...new Set([env.geminiModel, ...fallbacks])];
}

async function geminiOnce(model, prompt, { search, maxTokens }) {
  const headers = { 'x-goog-api-key': env.geminiKey };
  const ms = search ? 60_000 : 30_000;
  // Newer API first ...
  const a = await post(`${GEMINI}/interactions`, headers, { model, input: prompt, ...(search ? { tools: [{ type: 'google_search' }] } : {}) }, ms);
  if (a.ok) return { ok: true, out: readInteraction(a.data) };
  // ... then the classic one (also used when the newer one isn't available for this key or model).
  const b = await post(
    `${GEMINI}/models/${encodeURIComponent(model)}:generateContent`,
    headers,
    { contents: [{ role: 'user', parts: [{ text: prompt }] }], ...(search ? { tools: [{ google_search: {} }] } : {}), generationConfig: { maxOutputTokens: maxTokens } },
    ms,
  );
  if (b.ok) return { ok: true, out: readGenerate(b.data) };
  console.warn(`[weekdeck] Gemini ${model} failed:`, a.status, googleReason(a.data), '|', b.status, googleReason(b.data));
  return { ok: false, status: b.status === 404 ? a.status : b.status, reason: googleReason(b.data) || googleReason(a.data) };
}

async function gemini(prompt, opts) {
  let last = null;
  const tried = [];
  for (const model of geminiModels()) {
    const r = await geminiOnce(model, prompt, opts);
    if (r.ok) return r.out;
    tried.push({ ...r, model });
    // Keep the most useful reason: a quota problem says more than "model not available".
    last = tried.find((t) => t.status === 429) || { ...r, model };
    // A bad key or a blocked request won't get better with another model.
    if (r.status === 400 && /api key/i.test(r.reason)) throw new AiError('The Gemini key on the server isn’t valid. Check GEMINI_API_KEY.');
    if (r.status === 401 || r.status === 403) throw new AiError(`Google refused the request: ${r.reason || 'permission denied'}. Check the Gemini key and that the Gemini API is enabled for it.`);
  }
  if (last && last.status === 429) {
    const zero = /limit:\s*0\b/i.test(last.reason);
    throw new AiError(
      zero
        ? `Google’s free plan gives this key no allowance for ${tried.map((t) => t.model).join(', ')}. Check the key’s plan at aistudio.google.com, or set GEMINI_MODEL to a model your key can use.`
        : 'Google’s free limit for this key is used up for now (per minute or per day). Try again later.',
    );
  }
  throw new AiError(last && last.reason ? `The AI didn’t answer: ${last.reason}` : 'The AI didn’t answer just now. Try again in a minute.');
}

async function anthropic(prompt, { maxTokens }) {
  const r = await post(
    'https://api.anthropic.com/v1/messages',
    { 'x-api-key': env.anthropicKey, 'anthropic-version': '2023-06-01' },
    { model: env.aiModel, max_tokens: maxTokens, messages: [{ role: 'user', content: prompt }] },
    30_000,
  );
  if (!r.ok) {
    console.warn('[weekdeck] Anthropic failed', r.status, JSON.stringify(r.data).slice(0, 300));
    throw new AiError('The AI didn’t answer just now. Try again in a minute.');
  }
  return { text: (r.data.content || []).map((c) => c.text || '').join(''), sources: [], suggestionsHtml: '' };
}

/**
 * Ask the AI. With `search: true` it must look things up on Google first
 * (Gemini only), and the result includes the links it used.
 */
async function generate(prompt, { search = false, maxTokens = 900 } = {}) {
  const p = providers();
  const which = search ? p.search : p.text;
  if (!which) throw new AiError(search ? 'Event search needs a Gemini key on the server.' : 'AI is not switched on for this website.');
  let out;
  try {
    out = which === 'gemini' ? await gemini(prompt, { search, maxTokens }) : await anthropic(prompt, { maxTokens });
  } catch (err) {
    if (err instanceof AiError) throw err;
    throw new AiError('The AI didn’t answer just now. Check the internet and try again.');
  }
  return { ...out, sources: dedupe(out.sources) };
}

/** The first {...} block in a reply, parsed, or null. */
function jsonFrom(text) {
  const m = /\{[\s\S]*\}/.exec(String(text || '').replace(/```json|```/g, ''));
  if (!m) return null;
  try {
    return JSON.parse(m[0]);
  } catch {
    return null;
  }
}

module.exports = { generate, providers, jsonFrom, readInteraction, readGenerate, AiError };
