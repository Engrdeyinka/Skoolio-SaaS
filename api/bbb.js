/**
 * api/bbb.js — BigBlueButton server-side proxy
 *
 * Signs BBB API calls with the shared secret (kept server-side).
 * All actions (create, join, end, isMeetingRunning) go through here.
 *
 * Required env vars (set in Vercel dashboard):
 *   BBB_URL    — e.g. https://your-bbb-server.com
 *   BBB_SECRET — your BBB shared secret
 */

import crypto from 'crypto';

const BBB_URL    = process.env.BBB_URL;
const BBB_SECRET = process.env.BBB_SECRET;

function makeChecksum(action, queryString) {
  return crypto
    .createHash('sha1')
    .update(action + queryString + BBB_SECRET)
    .digest('hex');
}

function buildApiUrl(action, params = {}) {
  const qs       = new URLSearchParams(params).toString();
  const checksum = makeChecksum(action, qs);
  return `${BBB_URL}/bigbluebutton/api/${action}?${qs}&checksum=${checksum}`;
}

function xmlGet(xml, tag) {
  return xml.match(new RegExp(`<${tag}>([^<]*)<\\/${tag}>`))?.[1] ?? null;
}

export default async function handler(req, res) {
  // CORS for preflight
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (!BBB_URL || !BBB_SECRET) {
    return res.status(503).json({
      error: 'BigBlueButton is not configured. Add BBB_URL and BBB_SECRET to your Vercel environment variables.',
    });
  }

  const { action, _redirect, ...params } = req.query;

  if (!action) {
    return res.status(400).json({ error: 'action parameter is required' });
  }

  const apiUrl = buildApiUrl(action, params);

  // For join with _redirect=1, proxy redirects the browser straight to BBB
  if (_redirect === '1') {
    return res.redirect(302, apiUrl);
  }

  try {
    const upstream = await fetch(apiUrl, {
      headers: { 'User-Agent': 'TunmiseSchoolApp/1.0' },
    });
    const xml = await upstream.text();

    res.json({
      returncode:           xmlGet(xml, 'returncode'),
      running:              xmlGet(xml, 'running') === 'true',
      meetingID:            xmlGet(xml, 'meetingID'),
      attendeePW:           xmlGet(xml, 'attendeePW'),
      moderatorPW:          xmlGet(xml, 'moderatorPW'),
      messageKey:           xmlGet(xml, 'messageKey'),
      message:              xmlGet(xml, 'message'),
      participantCount:     parseInt(xmlGet(xml, 'participantCount') || '0', 10),
      listenerCount:        parseInt(xmlGet(xml, 'listenerCount')    || '0', 10),
      videoCount:           parseInt(xmlGet(xml, 'videoCount')       || '0', 10),
      hasBeenForciblyEnded: xmlGet(xml, 'hasBeenForciblyEnded') === 'true',
    });
  } catch (err) {
    res.status(502).json({ error: `BBB proxy error: ${err.message}` });
  }
}
