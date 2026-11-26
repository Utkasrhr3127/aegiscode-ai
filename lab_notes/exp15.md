# Experiment 15: AegisCode AI — Full-Stack AI Code Security Auditor & Architecture Platform

## Aim
Build and deploy a complete AI-enabled full-stack web application integrating a responsive frontend, REST backend, MongoDB database, JWT + RBAC authentication, and Generative AI inference.

## Architecture
- **Frontend:** Dark-mode developer UI (`index.html`, `auth.html`, `dashboard.html`, `auditor.html`, `report.html`, `admin.html`) built with safe DOM helpers (`h()`, `mdToDom()`, zero `innerHTML`).
- **Backend:** Express 5 (`exp15_capstone/server.js`) serving both static pages and `/api/*` endpoints on one port.
- **Database:** MongoDB via Mongoose (`User` + `AuditReview` with compound index `{ user: 1, createdAt: -1 }`).
- **Generative AI:** Groq LLM (`lib/gemini.js`) with dynamic `/models` discovery, structured JSON code auditing (`score`, `grade`, `complexity`, `findings`, `refactoredCode`), and multi-turn follow-up AI mentor chat.
- **Security:** `bcryptjs` password hashing, JWT 2h expiry, rate limiting, `X-Powered-By` disabled, `nosniff`, NoSQL operator blocking, and production env guards.
