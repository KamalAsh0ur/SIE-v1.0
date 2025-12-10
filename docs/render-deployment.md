# SIE Backend - Render.com Deployment

## Alternative: Render.com (Free Tier)

Since Railway isn't working, **Render.com** is an excellent free alternative:

| Feature | Render Free Tier |
|---------|------------------|
| Web Services | 750 hrs/month |
| RAM | 512MB |
| Database | PostgreSQL 256MB |
| Redis | Not included (use Upstash) |

---

## Quick Deploy to Render

### Option 1: One-Click Deploy

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy)

### Option 2: Manual Setup

1. Go to [render.com](https://render.com)
2. Sign up with GitHub
3. Click **"New +"** → **"Web Service"**
4. Connect GitHub repo: `KamalAsh0ur/SIE-v1.0`
5. Configure:

| Setting | Value |
|---------|-------|
| Name | `sie-backend` |
| Root Directory | `backend` |
| Runtime | Python 3 |
| Build Command | `pip install -r requirements.txt` |
| Start Command | `uvicorn app.main:app --host 0.0.0.0 --port $PORT` |

6. Add Environment Variables:
   - `DATABASE_URL` - PostgreSQL connection string
   - `REDIS_URL` - Upstash Redis URL
   - `API_SECRET_KEY` - Your secret key
   - `ENVIRONMENT` - `production`

7. Click **"Create Web Service"**

---

## render.yaml (Blueprint)

Create this file for automatic configuration:

```yaml
services:
  - type: web
    name: sie-backend
    runtime: python
    rootDir: backend
    buildCommand: pip install -r requirements.txt && python -m spacy download en_core_web_sm || true
    startCommand: uvicorn app.main:app --host 0.0.0.0 --port $PORT
    envVars:
      - key: PYTHON_VERSION
        value: 3.11.0
      - key: ENVIRONMENT
        value: production
      - key: DEBUG
        value: false
    healthCheckPath: /health
```

---

## Free Database Options

### PostgreSQL (Render)
- Create in Render dashboard
- 256MB free tier

### PostgreSQL (Supabase)
- 500MB free tier
- Better option

### Redis (Upstash)
- 10k commands/day free
- Required for Celery

---

## Environment Variables

```env
DATABASE_URL=postgresql://user:pass@host:5432/db
REDIS_URL=rediss://default:xxx@xxx.upstash.io:6379
API_SECRET_KEY=your-32-char-secret-key
ENVIRONMENT=production
DEBUG=false
NLP_MODEL=en_core_web_sm
OCR_LANGUAGES=en
```

---

## Other Free Alternatives

| Platform | Free Tier | Notes |
|----------|-----------|-------|
| **Render** | 750 hrs/month | Recommended |
| **Fly.io** | 3 shared VMs | More complex |
| **Koyeb** | 1 nano instance | Simple |
| **Vercel** | Serverless only | Not for this |
