// DEVELOPMENT ONLY. A local stand-in for the Gemini API and the image service, used to test the "live" code path
// of Experiments 9 to 12 without internet. Its answers are canned, so NEVER use screenshots made with it in the lab record.
//   node dev_tools/mock_gemini.js            (listens on http://localhost:4010)
//   GEMINI_BASE_URL=http://localhost:4010 IMAGE_API_BASE=http://localhost:4010 GEMINI_API_KEY=test node exp9_textgen/server.js
const http = require('http');
const PORT = Number(process.env.MOCK_PORT) || 4010;
const log = [];
let fail503 = Number(process.env.MOCK_FAIL503) || 0;   // fail this many generateContent calls with 503, to test retries

const models = ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.5-pro', 'gemini-flash-latest', 'text-embedding-004'];
const reply = (system, parts, contents) => {
  const text = parts.filter(p => p.text).map(p => p.text).join('\n');
  const hasImage = parts.some(p => p.inlineData);
  if (hasImage) return JSON.stringify({ caption: 'A small sailboat rests on a calm lake as the sun rises behind layered blue mountains.', altText: 'A sailboat on a still lake with mountains and a low orange sun in the background.', tags: ['sunrise', 'lake', 'boat', 'mountains', 'calm'] });
  if (/Notes Desk/.test(system)) {
    if (/Summarise/.test(text)) return /bulleted list/.test(text) ? '- REST uses ordinary HTTP requests.\n- Each **resource** has its own URL.\n- The method says the action: GET, POST, PUT, PATCH, DELETE.\n- The server is **stateless**, so each request carries a token.\n- Status codes such as 200, 201, 400, 401, 404 and 500 report the result.\n- JSON is the usual body format.' : 'A REST API lets a client use plain HTTP requests on resources that each have a URL. The method (GET, POST, PUT, PATCH, DELETE) names the action, the server remembers nothing between requests, and status codes report the result, usually with a JSON body.';
    if (/Rewrite/.test(text)) return 'A **REST API** allows a client to communicate with a server through standard HTTP requests. Every resource is addressed by its own URL, and the HTTP method states the intended operation.';
    if (/Explain/.test(text)) return '### The idea\nThink of a REST API like a menu at a restaurant. Each dish (a **resource**) has a name (its URL).\n\n### The actions\n- **GET** looks at the dish\n- **POST** orders a new one\n- **DELETE** cancels it\n\nThe kitchen forgets you after each order, so you show your table card (a **token**) every time.';
    if (/practice questions/.test(text)) return '1. What does the HTTP method POST do in a REST API?\n   *Model answer: it creates a new resource.*\n\n2. Explain why a REST server is called stateless.\n   *Model answer: it keeps nothing about earlier requests, so each one must carry all it needs, such as a token.*\n\n3. Which status code means a resource was created?\n   *Model answer: 201.*';
  }
  if (/Spoke/.test(system)) {
    const last = contents[contents.length - 1].parts[0].text, earlier = contents.slice(0, -1).map(c => c.parts[0].text).join(' ');
    if (/ranthambore|tour/i.test(last)) return "I'm not sure about tours to Ranthambore. Please call +91 99999 00000 or email hello@pinkcitypedals.example and the team will help.";
    if (/weekend/i.test(last) && /electric/i.test(earlier)) return 'The electric bike weekend deal (Saturday and Sunday together) is Rs 1,399, plus the Rs 5,000 refundable deposit.';
    if (/electric/i.test(last)) return 'Yes, we rent electric bikes for Rs 799 per day. A refundable deposit of Rs 5,000 and an original ID proof are needed.';
    if (/timing|open/i.test(last)) return 'We are open every day from 8:00 am to 8:00 pm, except Tuesdays.';
    if (/puncture/i.test(last)) return 'A puncture repair is Rs 60. A basic service is Rs 350 and a full service Rs 900.';
    if (/sunrise/i.test(last)) return 'The **Old City sunrise ride** starts at 6:00 am every day, lasts 3 hours and costs Rs 650 per person (minimum 2 riders).';
    return 'I can help with rentals, repairs and the sunrise ride. What would you like to know?';
  }
  if (/Draftdesk|Tideline/.test(system)) {
    if (/Write a blog post/.test(text)) return '# Why Your First Hackathon Matters\n\nThe first night of a hackathon feels chaotic, and that is exactly the point.\n\n## You learn faster under a clock\nWith 24 hours on the board, you stop polishing and start building.\n\n## You meet people outside your section\nTeams of four mix branches, and the best ideas come from the odd pairings.\n\n## Failure is cheap here\nA broken demo at 3 am costs nothing, and the fix teaches more than a lecture.\n\nSo sign up, find three friends, and bring a charger.';
    if (/Write an email/.test(text)) return 'Subject: Join the 24-hour college hackathon in March\n\nHi everyone,\n\nThe tech club is hosting a 24-hour hackathon in March, and registrations open this week. Teams can have up to four members, so grab your friends and pick a problem you care about.\n\nFood and snacks are on us. No experience needed, only curiosity.\n\nReply to this email to reserve your team slot.\n\nBest wishes,\nUtkarsh Shrivastava';
    if (/Write one/.test(text)) return 'Sleep is overrated. 24 hours, 4 teammates, unlimited snacks and one very stubborn bug waiting for you. Registrations for the college hackathon are open. #Hackathon #CollegeLife #BuildSomething';
  }
  return 'Mock answer.';
};

function svg(prompt, seed, w, h) {
  const hue = (seed * 37) % 360;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="hsl(${hue},60%,22%)"/><stop offset="1" stop-color="hsl(${(hue + 50) % 360},70%,62%)"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/><circle cx="${w * .68}" cy="${h * .45}" r="${Math.min(w, h) * .12}" fill="#ffe9b0"/><text x="${w / 2}" y="${h - 30}" font-family="Arial" font-size="${Math.round(w / 40)}" fill="#fff" text-anchor="middle">MOCK IMAGE (test only)</text></svg>`;
}

http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  const send = (code, obj, type) => { res.writeHead(code, { 'Content-Type': type || 'application/json' }); res.end(type ? obj : JSON.stringify(obj)); };
  let body = ''; req.on('data', d => body += d);
  req.on('end', () => {
    log.push(req.method + ' ' + u.pathname);
    if (u.pathname === '/__log') return send(200, log);
    if (u.pathname.startsWith('/prompt/')) {
      if (process.env.MOCK_IMAGE_FAIL) return send(Number(process.env.MOCK_IMAGE_FAIL), { error: 'nope' });
      const w = +u.searchParams.get('width') || 768, hh = +u.searchParams.get('height') || 768, seed = +u.searchParams.get('seed') || 1;
      return setTimeout(() => send(200, svg(decodeURIComponent(u.pathname.slice(8)), seed, w, hh), 'image/svg+xml'), 1200);
    }
    const key = req.headers['x-goog-api-key'];
    if (key === 'BADKEY') return send(400, { error: { code: 400, message: 'API key not valid. Please pass a valid API key.', status: 'INVALID_ARGUMENT' } });
    if (u.pathname === '/v1beta/models') return send(200, { models: models.map(n => ({ name: 'models/' + n, supportedGenerationMethods: /embedding/.test(n) ? ['embedContent'] : ['generateContent'] })) });
    const m = u.pathname.match(/^\/v1beta\/models\/([^:]+):generateContent$/);
    if (m && req.method === 'POST') {
      if (process.env.MOCK_FAIL_MODEL && m[1] === process.env.MOCK_FAIL_MODEL) return send(503, { error: { code: 503, message: 'overloaded', status: 'UNAVAILABLE' } });
      if (fail503 > 0) { fail503--; return send(503, { error: { code: 503, message: 'The model is overloaded.', status: 'UNAVAILABLE' } }); }
      const b = JSON.parse(body || '{}');
      const all = JSON.stringify(b.contents);
      if (all.includes('[[429]]')) return send(429, { error: { code: 429, message: 'Quota exceeded', status: 'RESOURCE_EXHAUSTED' } });
      const sys = b.systemInstruction ? b.systemInstruction.parts[0].text : '';
      const parts = b.contents[b.contents.length - 1].parts;
      return setTimeout(() => send(200, { candidates: [{ content: { role: 'model', parts: [{ text: reply(sys, parts, b.contents) }] }, finishReason: 'STOP' }], modelVersion: m[1] + '-mock' }), 700);
    }
    send(404, { error: { code: 404, message: 'not found: ' + u.pathname } });
  });
}).listen(PORT, () => console.log('Mock Gemini + image service on http://localhost:' + PORT));
