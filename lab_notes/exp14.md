# Experiment 14: Testing, Debugging, Performance & Security (AegisCode AI)

## Aim
Perform automated testing, dependency auditing, performance benchmarking, and security analysis on AegisCode AI.

## What Was Tested & Verified
1. **Automated Tests (`npm test` & `npm run test:capstone`):**
   - `test/gemini.test.js`: AI client error mapping (401/429/503/504), retry, Gemini & Groq dynamic `/models` discovery, fallback, rate limiter, and demo mode.
   - `test/security_static.test.js`: `.gitignore` protection, no API keys in client assets, zero `innerHTML` usage (XSS prevention).
   - `test_capstone/capstone.test.js`: `/health`, input validation, duplicate email 409, role escalation blocked, NoSQL `$ne` injection blocked, JWT auth, AI review creation, stats aggregation, follow-up mentor chat, public report visibility, and Admin RBAC (`403` vs `200`).
2. **Dependency Security (`npm audit`):** Verified dependencies against known CVEs.
3. **Performance (`scripts/perf14.js`):** Measured MongoDB query latency with `.lean()` and compound indexes.
4. **Lighthouse (`scripts/shots14.js`):** Audited Performance, Accessibility, Best Practices, and SEO on `/` and `/auth.html`.
