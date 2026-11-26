# Experiment 13: Deploying AegisCode AI with GitHub, Render and MongoDB Atlas

## Aim
Deploy a full-stack AI-enabled web application (**AegisCode AI**) using GitHub, Render, and MongoDB Atlas with proper version control and environment-based secrets.

## Tools Used
- **Version Control:** Git, GitHub (branches, pull request, release tag `v1.0.0`)
- **Cloud Hosting & DB:** Render (Web Service), MongoDB Atlas (M0 Free Cluster)
- **Backend & AI:** Node.js 22, Express 5, Mongoose, JWT + bcrypt, Groq API (`GROQ_API_KEY`)

## Key Deployment Features
- Single-service deployment (`npm start` runs `exp15_capstone/server.js`, serving both API and UI).
- `/health` endpoint returns `{"ok":true}` for Render health checks.
- Production guardrails: when `NODE_ENV=production`, the app refuses to boot without `JWT_SECRET` and `MONGODB_URI`, enables `trust proxy`, and disables demo account creation.
- Secrets stay in `.env` locally and Render's Environment tab in the cloud.
