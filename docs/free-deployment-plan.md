# SIE Zero-Cost Deployment Plan

## Overview

Deploy SIE completely free using free-tier services.

---

## Architecture (All Free Tier)

```
┌─────────────────────────────────────────────────────────────────┐
│                     FREE DEPLOYMENT STACK                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐    ┌───────────────┐    ┌─────────────────┐  │
│  │   Railway    │    │    Vercel     │    │   Supabase      │  │
│  │   Backend    │    │   Frontend    │    │   PostgreSQL    │  │
│  │   (Free)     │    │   (Free)      │    │   (Free)        │  │
│  └──────────────┘    └───────────────┘    └─────────────────┘  │
│         │                                          │            │
│         ▼                                          │            │
│  ┌──────────────┐    ┌───────────────┐            │            │
│  │   Upstash    │    │  Meilisearch  │◄───────────┘            │
│  │    Redis     │    │    Cloud      │                          │
│  │   (Free)     │    │   (Free)      │                          │
│  └──────────────┘    └───────────────┘                          │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Service Selection

| Component | Service | Free Tier Limits |
|-----------|---------|------------------|
| **API/Backend** | Railway | 500 hrs/month, 512MB RAM |
| **Frontend** | Vercel | Unlimited static, 100GB bandwidth |
| **Database** | Supabase | 500MB, 25k monthly rows |
| **Redis** | Upstash | 10k commands/day |
| **Search** | Meilisearch Cloud | 100k documents |
| **Storage** | Cloudflare R2 | 10GB, 1M requests/month |

**Total Monthly Cost: $0**

---

## Step-by-Step Deployment

### Step 1: Database (Supabase)

1. Go to [supabase.com](https://supabase.com)
2. Create new project
3. Get connection string from Settings → Database
4. Run schema:
```sql
-- Paste contents of backend/init.sql
```

**Environment variable:**
```
DATABASE_URL=postgresql://postgres:[password]@db.[project].supabase.co:5432/postgres
```

---

### Step 2: Redis (Upstash)

1. Go to [upstash.com](https://upstash.com)
2. Create Redis database (select region closest to Railway)
3. Copy REST URL

**Environment variable:**
```
REDIS_URL=rediss://default:[password]@[endpoint].upstash.io:6379
```

---

### Step 3: Search (Meilisearch Cloud)

1. Go to [cloud.meilisearch.com](https://cloud.meilisearch.com)
2. Create free project
3. Get API keys

**Environment variables:**
```
MEILISEARCH_URL=https://[project].meilisearch.io
MEILISEARCH_KEY=[master-key]
```

---

### Step 4: Backend (Railway)

1. Go to [railway.app](https://railway.app)
2. New Project → Deploy from GitHub
3. Select `KamalAsh0ur/SIE-v1.0`
4. Set root directory: `backend`
5. Add environment variables:

```env
DATABASE_URL=postgresql://...
REDIS_URL=rediss://...
MEILISEARCH_URL=https://...
MEILISEARCH_KEY=...
API_SECRET_KEY=<generate-secure-key>
ENVIRONMENT=production
DEBUG=false
```

6. Deploy automatically triggers

**Your API URL:** `https://sie-backend.up.railway.app`

---

### Step 5: Frontend (Vercel)

1. Go to [vercel.com](https://vercel.com)
2. Import GitHub repo
3. Set environment variable:
```
VITE_API_URL=https://sie-backend.up.railway.app
```
4. Deploy

**Your Frontend URL:** `https://sie.vercel.app`

---

### Step 6: Storage (Cloudflare R2) - Optional

1. Go to [dash.cloudflare.com](https://dash.cloudflare.com)
2. R2 → Create bucket
3. Add to Railway env:
```
ARCHIVE_PROVIDER=r2
ARCHIVE_BUCKET=sie-archive
ARCHIVE_ENDPOINT_URL=https://[account].r2.cloudflarestorage.com
ARCHIVE_ACCESS_KEY=...
ARCHIVE_SECRET_KEY=...
```

---

## Environment Variables Summary

### Railway Backend
```env
# Database
DATABASE_URL=postgresql://postgres:xxx@db.xxx.supabase.co:5432/postgres

# Redis
REDIS_URL=rediss://default:xxx@xxx.upstash.io:6379

# Search
MEILISEARCH_URL=https://xxx.meilisearch.io
MEILISEARCH_KEY=xxx

# Security
API_SECRET_KEY=generate-with-openssl-rand-hex-32
ENVIRONMENT=production
DEBUG=false

# NLP/OCR (optional, uses defaults)
NLP_MODEL=en_core_web_sm
OCR_LANGUAGES=en
```

### Vercel Frontend
```env
VITE_API_URL=https://your-app.up.railway.app
```

---

## Deployment Commands

### Manual Deploy to Railway
```bash
# Install Railway CLI
npm install -g @railway/cli

# Login
railway login

# Link project
cd backend
railway link

# Deploy
railway up
```

### With GitHub (Automatic)
Push to main branch → Auto-deploys on Railway & Vercel

---

## Free Tier Limitations

| Service | Limit | Mitigation |
|---------|-------|------------|
| Railway | 500 hrs/month | Sleeps when idle |
| Supabase | 500MB DB | Archive old data to R2 |
| Upstash | 10k cmd/day | Batch Redis operations |
| Meilisearch | 100k docs | Prune old documents |

---

## Scaling Beyond Free

When you need more:

| Service | Free → Paid |
|---------|-------------|
| Railway | $5/month for 24/7 |
| Supabase | $25/month for 8GB |
| Upstash | $10/month for 50k/day |

---

## Quick Start Checklist

- [ ] Create Supabase project & run schema
- [ ] Create Upstash Redis
- [ ] Create Meilisearch Cloud project
- [ ] Deploy backend to Railway
- [ ] Deploy frontend to Vercel
- [ ] Configure environment variables
- [ ] Test `/health` endpoint
- [ ] Connect frontend to backend

---

## Alternative: Single-Container (Render)

If you prefer one service:

1. [render.com](https://render.com) - Free tier
2. Deploy Docker container
3. Uses in-memory Redis (no persistence)
4. SQLite instead of PostgreSQL

Less robust but simpler.
