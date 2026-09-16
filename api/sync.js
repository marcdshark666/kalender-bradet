// Vercel serverless: kontolagring i ett PRIVAT GitHub-repo via Contents API —
// samma mönster som packing-road/api/sync.js (Vercel Blob är avstängt på kontot).
//
// Env: GH_DATA_TOKEN (PAT med repo-scope), GH_DATA_REPO ("owner/repo").
// Layout i repot:  kalender-bradet/users/<sha256(email)>.json
//
// Ett konto = en e-postadress. PIN är frivillig: sätts en PIN vid första
// sparningen måste alla senare anrop skicka samma PIN-hash. Uppgifter går
// ALLTID i POST-body, aldrig i URL:en. GET = hälsokoll utan användardata.

const crypto = require('crypto');

const TOKEN = process.env.GH_DATA_TOKEN || '';
const REPO = process.env.GH_DATA_REPO || '';
const configured = !!(TOKEN && REPO);
const MAX_STATE = 1500000;
const API = 'https://api.github.com/repos/' + REPO + '/contents/';

function hash(s) { return crypto.createHash('sha256').update(String(s)).digest('hex'); }
function userPath(email) { return 'kalender-bradet/users/' + hash(email) + '.json'; }
function validEmail(e) { return typeof e === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) && e.length < 200; }
function pinOf(body) { return typeof body.pin === 'string' && body.pin.length ? hash('pin:' + body.pin) : ''; }

function ghCall(path, method, bodyObj) {
  const init = { method: method || 'GET', headers: {
    'Authorization': 'Bearer ' + TOKEN,
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'kalender-bradet',
    'Content-Type': 'application/json',
  } };
  if (bodyObj) init.body = JSON.stringify(bodyObj);
  return fetch(API + path, init);
}

module.exports = async function (req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(204).end();

  if (req.method === 'GET') {
    if (!configured) return res.status(503).json({ ok: false, reason: 'no_token' });
    try {
      const r = await ghCall('', 'GET');
      return r.ok ? res.status(200).json({ ok: true }) : res.status(503).json({ ok: false, reason: 'github_' + r.status });
    } catch (e) { return res.status(503).json({ ok: false, reason: 'github_unreachable' }); }
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!configured) return res.status(503).json({ error: 'Lagring ej kopplad' });

  try {
    let body = req.body || {};
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
    const action = body.action;
    const email = String(body.email || '').trim().toLowerCase();
    if (!validEmail(email)) return res.status(400).json({ error: 'Ogiltig e-post' });

    const recRes = await ghCall(userPath(email) + '?ref=main', 'GET');
    let rec = null, recSha = null;
    if (recRes.ok) {
      const j = await recRes.json(); recSha = j.sha;
      try { rec = JSON.parse(Buffer.from(j.content || '', 'base64').toString('utf8')); } catch { rec = null; }
    } else if (recRes.status !== 404) return res.status(502).json({ error: 'GitHub ' + recRes.status });

    const pin = pinOf(body);
    if (rec && rec.pin && rec.pin !== pin) return res.status(401).json({ error: 'Fel PIN' });

    if (action === 'get') {
      if (!rec) return res.status(404).json({ error: 'Inget konto ännu' });
      return res.status(200).json({ state: rec.state || null, hasPin: !!rec.pin, updatedAt: rec.updatedAt || 0 });
    }
    if (action === 'put') {
      const state = body.state;
      if (!state || typeof state !== 'object' || Array.isArray(state)) return res.status(400).json({ error: 'Ogiltigt state' });
      if (JSON.stringify(state).length > MAX_STATE) return res.status(413).json({ error: 'För stor kalender' });
      const nextPin = rec && rec.pin ? rec.pin : pin;
      const payload = { message: 'kalender ' + hash(email).slice(0, 8), branch: 'main',
        content: Buffer.from(JSON.stringify({ pin: nextPin, state, updatedAt: Date.now() })).toString('base64') };
      if (recSha) payload.sha = recSha;
      const w = await ghCall(userPath(email), 'PUT', payload);
      if (!w.ok) return res.status(502).json({ error: 'GitHub ' + w.status });
      return res.status(200).json({ ok: true, updatedAt: Date.now() });
    }
    return res.status(400).json({ error: 'Okänd action' });
  } catch (e) {
    console.error('sync error', e);
    return res.status(500).json({ error: 'Serverfel' });
  }
};
