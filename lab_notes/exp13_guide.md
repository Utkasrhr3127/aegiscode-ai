# Experiment 13 Guide: Put AegisCode AI Online (GitHub + MongoDB Atlas + Render)

## Part A: Git & GitHub
1. Open CMD in your `aegiscode-ai` folder:
   ```cmd
   git init
   git branch -M main
   git status
   ```
   Verify `.env`, `node_modules`, and `screenshots` are NOT listed.
2. Make clean conventional commits and push to GitHub:
   ```cmd
   git add package.json .gitignore .env.example README.md lib shared student.config.json
   git commit -m "chore: setup shared libs, Groq client and config"
   git add exp15_capstone
   git commit -m "feat: build AegisCode AI full-stack security auditor"
   git add .
   git commit -m "test: add automated tests, scripts and lab notes"
   git remote add origin https://github.com/<your-username>/aegiscode-ai.git
   git push -u origin main
   ```
3. Create a feature branch, open a Pull Request, merge it, and tag `v1.0.0`:
   ```cmd
   git switch -c feature/deploy-config
   echo Deployed on Render + MongoDB Atlas + Groq>> README.md
   git add README.md
   git commit -m "docs: add deployment note"
   git push -u origin feature/deploy-config
   ```
   Merge the PR on GitHub, then:
   ```cmd
   git switch main
   git pull
   git tag -a v1.0.0 -m "v1.0.0: AegisCode AI production release"
   git push origin v1.0.0
   ```

## Part B: MongoDB Atlas
1. Create a free **M0** cluster on `https://mongodb.com/cloud/atlas`.
2. Create a database user (`aegisadmin`) and save the password.
3. Under **Network Access**, allow `0.0.0.0/0` so Render can connect.
4. Copy the `mongodb+srv://...` connection string (`MONGODB_URI`).

## Part C: Render Web Service
1. Generate a JWT secret in CMD:
   ```cmd
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```
2. On `https://render.com` -> **New +** -> **Web Service** -> connect your GitHub repo:
   - **Build Command:** `npm install --omit=dev`
   - **Start Command:** `npm start`
   - **Health Check Path:** `/health`
3. Under **Environment Variables**, add:
   - `NODE_ENV` = `production`
   - `MONGODB_URI` = `<your Atlas URI>`
   - `JWT_SECRET` = `<your 64-char hex secret>`
   - `GROQ_API_KEY` = `<your gsk_... key from console.groq.com>`
   - `ADMIN_EMAIL` = `<your admin email>`
   - `ADMIN_PASSWORD` = `<strong admin password>`
4. Deploy and test the live URL!
