/**
 * api/ask.js — AI Tutor proxy
 * Calls Anthropic Claude API server-side (keeps API key secret).
 * Required env var: ANTHROPIC_API_KEY (set in Vercel dashboard)
 */

// Try models newest-first; first one that works will be used.
const MODELS = [
  'claude-opus-4-5',
  'claude-sonnet-4-5',
  'claude-haiku-4-5',
  'claude-3-5-sonnet-20241022',
  'claude-3-5-haiku-20241022',
  'claude-3-haiku-20240307',
];

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(503).json({ error: 'AI Tutor is not configured. Add ANTHROPIC_API_KEY to Vercel environment variables.' });
  }

  const { question, history = [] } = req.body || {};
  if (!question?.trim()) return res.status(400).json({ error: 'Question is required.' });

  // Build messages array — include last 6 messages of history for context
  const messages = [
    ...history.slice(-6),
    { role: 'user', content: question.trim() },
  ];

  const systemPrompt = `You are a school tutor for Nigerian secondary school students (JSS 1 to SSS 3).

STRICT RULES — follow every one:
1. Answer DIRECTLY. Never start with "Great question!", "Sure!", "Of course!" or any filler.
2. For maths, physics, chemistry or any calculation problem: ALWAYS show numbered step-by-step working. Label each step clearly.
3. For definitions: state the definition first, then give one real-world example.
4. For "explain" questions: one-sentence summary first, then elaboration in short paragraphs.
5. Use simple, clear English suitable for a 12–18 year-old Nigerian student.
6. Never say "As an AI…" or add disclaimers about being an AI.
7. If a question has a single numerical answer, state the final answer on its own line prefixed with "Answer:".
8. Keep responses focused — do not pad with unnecessary context.
9. Use the Nigerian curriculum context where relevant (WAEC, NECO, JAMB standards).
10. FORMATTING RULES (very important):
    - Use ## for main section headings, ### for sub-headings.
    - Use numbered lists (1. 2. 3.) for steps.
    - Use bullet points (- ) for lists.
    - Use **bold** for key terms.
    - Separate major sections with --- on its own line.
    - For tables use markdown pipe format: | Col1 | Col2 |
    - For ALL maths: use LaTeX notation. Inline expressions use $...$, standalone equations use $$...$$. Example: "The formula is $$x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}$$".`;

  // Try each model in order until one succeeds
  const headers = {
    'x-api-key': apiKey.trim(),
    'anthropic-version': '2023-06-01',
    'content-type': 'application/json',
  };

  let lastStatus = 0;
  let lastRaw = '';

  for (const model of MODELS) {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers,
      body: JSON.stringify({ model, max_tokens: 1024, system: systemPrompt, messages }),
    });

    const rawText = await response.text();
    console.log(`[${model}] ${response.status}: ${rawText.slice(0, 300)}`);

    let data;
    try { data = JSON.parse(rawText); } catch { data = {}; }

    // Auth error — no point trying other models
    if (response.status === 401 || response.status === 403) {
      return res.status(502).json({
        error: `API key error (${response.status}): ${data?.error?.message || rawText.slice(0, 200)}`,
      });
    }

    // Model not available — try next
    if (response.status === 404 || data?.error?.type === 'not_found_error') {
      lastStatus = response.status;
      lastRaw = rawText;
      continue;
    }

    // Success
    if (response.ok) {
      let answer = data.content?.[0]?.text || '';
      // If the response was cut off by the token limit, tell the student
      if (data.stop_reason === 'max_tokens') {
        answer += '\n\n---\n*The response was cut off. Type **continue** to get the rest.*';
      }
      console.log(`AI Tutor answered using model: ${model}, stop_reason: ${data.stop_reason}`);
      return res.json({ answer, model, truncated: data.stop_reason === 'max_tokens' });
    }

    // Other error — return it
    const errMsg = data?.error?.message || data?.error || rawText.slice(0, 300);
    return res.status(502).json({ error: `Anthropic ${response.status}: ${errMsg}` });
  }

  // All models failed
  return res.status(502).json({
    error: `No Claude model is available on this API key. Last status: ${lastStatus}. Try creating a new API key at console.anthropic.com`,
    rawError: lastRaw.slice(0, 300),
  });
}
