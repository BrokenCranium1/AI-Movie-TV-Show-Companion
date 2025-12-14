# Deployment Guide

This walkthrough helps you host StevieTheTV for beta testers without paying for infrastructure. It covers local prep plus two free hosting options (Render and Fly.io).

## 1. Local Smoke Test

```bash
python -m venv .venv
source .venv/bin/activate   # .venv\Scripts\activate on Windows
pip install -r requirements.txt
export GROQ_API_KEY="gsk_your_key"   # or set OPENAI_API_KEY / OLLAMA_BASE_URL
python run_server.py
```

Visit `http://localhost:8000`, upload a short MP4 + `.srt`, and confirm Q&A works.

## 2. Deploy to Render (free tier)

1. Push this repo to GitHub and create a Render account.
2. New → Web Service → pick the repo.
3. Settings:
   - Build Command: `pip install -r requirements.txt`
   - Start Command: `uvicorn movie_companion.server.api:create_app --host 0.0.0.0 --port $PORT`
   - Instance: Free
4. Environment variables:
   - `GROQ_API_KEY` (recommended) or `OPENAI_API_KEY`
5. Click “Create Web Service”. After build, Render gives you a URL such as `https://stevie-beta.onrender.com`.

**Note:** Free Render disks reset on redeploy/sleep. Keep demo videos handy so you can re-upload after each deploy.

## 3. Deploy to Fly.io (free tier with persistent storage)

1. Install Fly CLI (`curl -L https://fly.io/install.sh | sh`).
2. `fly auth login`, then inside the repo run `fly launch` and accept defaults (decline Postgres).
3. Fly creates `fly.toml`. Ensure the `[env]` block includes `GROQ_API_KEY`.
4. `fly volumes create data_volume --size 1` and mount it in the `fly.toml` under `[mounts]` for `/app/data` (repeat for `/app/media` if needed).
5. `fly deploy`.

Fly provides a public HTTPS URL and keeps the volume contents between deploys.

## 4. Beta Tester Onboarding

- Share the hosted URL with a simple three-step instruction sheet (select demo video → press play → ask a question).
- Preload one or two demo videos yourself so testers don’t need to upload anything.
- Use the “Viewer Notes” panel to collect feedback directly in the app.
- Monitor logs via Render’s dashboard or `fly logs`.

## 5. Environment Variables Recap

| Variable | Purpose | Notes |
| --- | --- | --- |
| `GROQ_API_KEY` | Call Groq’s hosted Llama/Mixtral models (recommended) | Free developer key. |
| `OPENAI_API_KEY` | Call OpenAI models | Paid after trial credits. |
| `OLLAMA_BASE_URL` | Point to your own Ollama server | Defaults to `http://localhost:11434`. |

Pick one provider, set the corresponding key, and the rest of the app works out of the box.
