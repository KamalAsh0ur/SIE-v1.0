# External Dependencies Setup Guide

## Quick Start Commands

### 1. Start Redis
```bash
brew services start redis
redis-cli ping  # Should return PONG
```

### 2. Start Celery Worker
```bash
source /Volumes/Untitled/SIE-v1.0/.venv-stable/bin/activate
cd /Volumes/Untitled/SIE-v1.0/backend
celery -A app.workers.celery_app worker --loglevel=info
```

### 3. Start Meilisearch
```bash
brew services start meilisearch
# OR run in foreground:
meilisearch --http-addr 127.0.0.1:7700
```

### 4. Start API Server
```bash
source /Volumes/Untitled/SIE-v1.0/.venv-stable/bin/activate
cd /Volumes/Untitled/SIE-v1.0/backend
python -m uvicorn app.main:app --host 0.0.0.0 --port 8001
```

---

## Full Stack Startup Script

Create a script to start everything:

```bash
#!/bin/bash
# start-sie.sh

# Start Redis
brew services start redis

# Start Meilisearch  
meilisearch --http-addr 127.0.0.1:7700 &

# Activate venv
source /Volumes/Untitled/SIE-v1.0/.venv-stable/bin/activate
cd /Volumes/Untitled/SIE-v1.0/backend

# Start Celery worker
celery -A app.workers.celery_app worker --loglevel=info &

# Start API
python -m uvicorn app.main:app --host 0.0.0.0 --port 8001
```

---

## Environment Variables

Ensure `.env` has:

```env
# Redis
REDIS_URL=redis://localhost:6379

# Meilisearch
MEILISEARCH_URL=http://localhost:7700
MEILISEARCH_KEY=

# OCR
OCR_LANGUAGES=en
OCR_GPU=false
OCR_PREPROCESS=true
```

---

## Verify Services

### Redis
```bash
redis-cli ping
# PONG
```

### Meilisearch
```bash
curl http://localhost:7700/health
# {"status":"available"}
```

### Celery
```bash
celery -A app.workers.celery_app status
# -> celery@hostname: OK
```

### API
```bash
curl http://localhost:8001/health
# {"status":"healthy",...}
```

---

## Troubleshooting

### Redis won't start
```bash
brew services restart redis
```

### Celery can't connect
- Check Redis is running: `redis-cli ping`
- Check REDIS_URL in .env

### Meilisearch not found
```bash
brew install meilisearch
```

### EasyOCR slow on first run
- Downloads models (~100MB) on first use
- Subsequent runs are fast

---

## Service Ports

| Service | Port | URL |
|---------|------|-----|
| API | 8001 | http://localhost:8001 |
| Redis | 6379 | redis://localhost:6379 |
| Meilisearch | 7700 | http://localhost:7700 |
| Flower | 5555 | http://localhost:5555 |
