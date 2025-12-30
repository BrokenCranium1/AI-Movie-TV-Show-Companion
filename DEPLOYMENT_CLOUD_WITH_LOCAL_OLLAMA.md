# Deploying to Cloud with Local Ollama Server

This guide shows how to:
1. Deploy the web app to a **free cloud host** (Render, Railway, or Fly.io)
2. Keep Ollama running **locally on your machine**
3. Connect them using a **tunnel service** (ngrok or Cloudflare Tunnel)

## Option 1: ngrok (Easiest)

### Step 1: Install and Setup ngrok

1. **Sign up** at [ngrok.com](https://ngrok.com) (free tier available)
2. **Download ngrok** from [ngrok.com/download](https://ngrok.com/download)
3. **Get your authtoken** from the ngrok dashboard
4. **Authenticate**:
   ```powershell
   ngrok config add-authtoken YOUR_AUTH_TOKEN
   ```

### Step 2: Expose Your Local Ollama

Run this command to create a tunnel to your local Ollama:
```powershell
ngrok http 11434
```

You'll get a URL like: `https://abc123.ngrok-free.app`

**Important:** Keep this terminal window open! The tunnel needs to stay running.

### Step 3: Deploy App to Render (Free)

1. **Push your code to GitHub** (if not already)

2. **Go to [Render.com](https://render.com)** and sign up

3. **Create New Web Service**:
   - Connect your GitHub repo
   - Name: `stevie-the-tv` (or whatever you want)
   - Region: Choose closest to you
   - Branch: `main` (or your default branch)
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `python run_server.py`
   - **Instance Type**: Free

4. **Add Environment Variables** in Render dashboard:
   ```
   OLLAMA_BASE_URL=https://abc123.ngrok-free.app
   PORT=8000
   ```
   (Replace with your actual ngrok URL from Step 2)

5. **Click "Create Web Service"**

6. Render will build and deploy. You'll get a URL like: `https://stevie-the-tv.onrender.com`

### Step 4: Update Frontend to Use Cloud API

The frontend (app.js) currently hardcodes `provider: "ollama"` and `model: "llama3"`. This should work automatically, but verify it's using the cloud URL.

## Option 2: Cloudflare Tunnel (More Stable, Free Forever)

Cloudflare Tunnel is more reliable than ngrok and completely free.

### Step 1: Install Cloudflare Tunnel

1. **Sign up** at [Cloudflare Zero Trust](https://one.dash.cloudflare.com/) (free)
2. **Download cloudflared** from [developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/installation](https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/installation)

### Step 2: Create Tunnel

1. In Cloudflare dashboard, go to **Zero Trust → Access → Tunnels**
2. Click **Create a tunnel**
3. Name it `ollama-tunnel`
4. Copy the install command for your OS and run it

### Step 3: Configure Tunnel

Edit the config file (location shown after install) to add:
```yaml
ingress:
  - hostname: ollama.yourdomain.com  # Or use a random subdomain
    service: http://localhost:11434
  - service: http_status:404
```

### Step 4: Use the Tunnel URL

Use your Cloudflare tunnel URL in Render's `OLLAMA_BASE_URL` environment variable.

## Option 3: Railway (Alternative Free Host)

Railway is another excellent free option with easier setup:

1. Go to [railway.app](https://railway.app)
2. **New Project → Deploy from GitHub repo**
3. Add environment variables:
   ```
   OLLAMA_BASE_URL=https://your-ngrok-url.ngrok-free.app
   ```
4. Railway auto-detects Python and runs `run_server.py`

## Testing Your Setup

1. **Keep Ollama running** on your local machine
2. **Keep the tunnel running** (ngrok or Cloudflare)
3. **Visit your Render/Railway URL**
4. **Upload a video and test** - it should connect to your local Ollama!

## Important Notes

⚠️ **Tunnel Must Stay Running**: Your local Ollama and tunnel service must run 24/7 for the cloud app to work. If your computer goes to sleep or you close the tunnel, the cloud app won't be able to reach Ollama.

⚠️ **ngrok Free Tier Limits**: 
- ngrok free tier URLs change each time you restart (unless you pay)
- You'll need to update `OLLAMA_BASE_URL` in Render when the URL changes
- Or use Cloudflare Tunnel for a stable URL

⚠️ **Security**: The tunnel exposes your Ollama to the internet. Make sure you're okay with this for testing purposes.

## Making it Production-Ready

For production, consider:
- Using **Groq** (free tier) or **OpenAI** instead of local Ollama
- Or deploying Ollama to a cloud VM (DigitalOcean, AWS, etc.)
- Using a stable domain instead of tunnel URLs

## Quick Reference

```powershell
# Terminal 1: Start Ollama (if not running as service)
ollama serve

# Terminal 2: Start ngrok tunnel
ngrok http 11434

# Terminal 3: (Optional) Test locally first
$env:OLLAMA_BASE_URL="https://abc123.ngrok-free.app"
python run_server.py
```

Then deploy to Render/Railway with `OLLAMA_BASE_URL` set to your ngrok URL!









