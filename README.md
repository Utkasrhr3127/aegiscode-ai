# AegisCode AI — Code Security Auditor & Architecture Platform

**Student:** Utkarsh Shrivastava (23BCON1864, Section P) — Web Development Using AI (BAS001C)

This package covers **Experiments 13, 14, and 15**:
- **Experiment 15 (Capstone):** **AegisCode AI**, a full-stack AI code security & architecture auditing platform (Node.js 22, Express 5, MongoDB/Mongoose, JWT + bcrypt + RBAC, Groq AI with dynamic model discovery & fallback, SVG analytics, shareable reports, and interactive follow-up AI mentor chat).
- **Experiment 14 (Testing, Debugging, Performance, Security):** Automated test suite (`npm test` + `npm run test:capstone`), `npm audit`, MongoDB `.lean()` + compound index benchmark, and Lighthouse audits.
- **Experiment 13 (Deployment):** Production-ready Git + GitHub + MongoDB Atlas + Render deployment (`npm start`, `/health`, `NODE_ENV=production` guards).

## Quick Start
```bash
npm install
# Add GROQ_API_KEY=gsk_... to .env (or run: node scripts/setup_ai.js)
npm start
```
Open `http://localhost:3015` (or double-click `run.bat` on Windows).
