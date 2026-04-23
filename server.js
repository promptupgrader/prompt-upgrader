const http = require('http');
const https = require('https');

const PORT = process.env.PORT || 3000;
const API_KEY = process.env.ANTHROPIC_API_KEY;

// Simple in-memory rate limiter: IP → { count, resetTime }
const rateLimit = {};
const MAX_PER_DAY = 10;

function getRateLimit(ip) {
  const now = Date.now();
  if (!rateLimit[ip] || rateLimit[ip].resetTime < now) {
    rateLimit[ip] = { count: 0, resetTime: now + 24 * 60 * 60 * 1000 };
  }
  return rateLimit[ip];
}

const server = http.createServer((req, res) => {
  // CORS headers — allow any origin
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // Health check
  if (req.method === 'GET' && req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'Prompt Upgrader API running ✅' }));
    return;
  }

  if (req.method === 'POST' && req.url === '/upgrade') {
    // Rate limit check
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
    const rl = getRateLimit(ip);
    if (rl.count >= MAX_PER_DAY) {
      res.writeHead(429, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Daily limit reached. Come back tomorrow!' }));
      return;
    }
    rl.count++;

    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      let parsed;
      try { parsed = JSON.parse(body); } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid request' }));
        return;
      }

      const prompt = parsed.prompt;
      if (!prompt || typeof prompt !== 'string') {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'No prompt provided' }));
        return;
      }

      const SYS = `You are a world-class prompt engineering expert. You understand every human language — Gujarati, Hindi, Hinglish, English, Spanish, French, Arabic, and any mix or dialect. Your job is to analyze any weak or incomplete prompt and transform it into a TOP 1% quality prompt.

RULE: Always write the upgraded_prompt in clear, structured English so it works universally with any AI in the world.

GAPS TO DETECT:
- VAGUE: Too generic, no specifics
- NO_CONTEXT: Missing background about user's situation
- NO_GOAL: Unclear desired outcome
- NO_SCOPE: Missing format, length, depth, or audience constraints
- NO_TONE: Desired tone not specified
- AMBIGUOUS: Could be interpreted multiple ways
- TOO_SHORT: Needs far more detail to be actionable

Score the original 1-100. Score the upgraded version 1-100.

Write the analysis in clear English (2-3 sentences explaining what was missing and what you added).

Respond ONLY with this JSON — no extra text, no backticks:
{"gaps":["VAGUE","NO_CONTEXT"],"analysis":"Clear English: 2-3 sentences about what gaps existed and what was added to fix them.","score_before":18,"score_after":94,"upgraded_prompt":"AI ROLE: You are a [specific expert with relevant credentials].\\n\\nCONTEXT:\\n[Full background and situation the AI needs to know]\\n\\nSPECIFIC TASK:\\n[Exactly what to produce — numbered if multiple outputs needed]\\n\\nOUTPUT FORMAT:\\n[How to structure the answer — headings, bullets, tables, step-by-step, etc.]\\n\\nCONSTRAINTS:\\n[Audience, tone, length, language, what to avoid]\\n\\nSUCCESS CRITERIA:\\n[What a perfect answer looks like — be specific and measurable]"}`;

      const payload = JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1400,
        system: SYS,
        messages: [{ role: 'user', content: `Upgrade this prompt (it may be in any language — understand it fully): "${prompt}"` }]
      });

      const options = {
        hostname: 'api.anthropic.com',
        path: '/v1/messages',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': API_KEY,
          'anthropic-version': '2023-06-01',
          'Content-Length': Buffer.byteLength(payload)
        }
      };

      const apiReq = https.request(options, apiRes => {
        let data = '';
        apiRes.on('data', chunk => data += chunk);
        apiRes.on('end', () => {
          res.writeHead(apiRes.statusCode, { 'Content-Type': 'application/json' });
          res.end(data);
        });
      });

      apiReq.on('error', err => {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Failed to reach AI — try again' }));
      });

      apiReq.write(payload);
      apiReq.end();
    });
    return;
  }

  res.writeHead(404);
  res.end();
});

server.listen(PORT, () => {
  console.log(`✅ Prompt Upgrader server running on port ${PORT}`);
});
