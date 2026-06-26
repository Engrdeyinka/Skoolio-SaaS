/**
 * api/aloc.js — ALOC questions proxy
 *
 * Proxies ALOC question requests through Vercel so the browser does not hit
 * the upstream API directly. This avoids client-side fetch/CORS/network
 * failures during imports and live question loading.
 */

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, AccessToken");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const { subject, type, year, token } = req.query || {};
  if (!subject || !type) {
    return res.status(400).json({ error: "subject and type are required" });
  }

  try {
    const params = new URLSearchParams({ subject, type });
    if (year) params.set("year", year);

    const headers = {};
    const accessToken = String(token || "").trim();
    if (accessToken) headers.AccessToken = accessToken;

    const upstream = await fetch(`https://questions.aloc.com.ng/api/v2/m?${params.toString()}`, {
      headers,
    });

    const raw = await upstream.text();
    let data = null;
    try {
      data = JSON.parse(raw);
    } catch {
      data = null;
    }

    if (!upstream.ok) {
      return res.status(upstream.status).json({
        error: data?.message || data?.error || `ALOC returned HTTP ${upstream.status}`,
        raw: raw.slice(0, 400),
      });
    }

    return res.status(200).json(data || { data: [] });
  } catch (error) {
    return res.status(502).json({ error: `ALOC proxy error: ${error.message}` });
  }
}
