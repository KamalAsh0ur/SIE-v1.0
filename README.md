# SIE Backend - Smart Ingestion Engine

Python FastAPI backend service for content ingestion, NLP analysis, and insight generation.

## Tech Stack
- **Framework**: FastAPI
- **Workers**: Celery + Redis
- **NLP**: spaCy, VADER, HuggingFace DistilBERT
- **OCR**: EasyOCR
- **Database**: PostgreSQL (Supabase)
- **Search**: Meilisearch

## Quick Start

### Prerequisites
- Python 3.11+
- Redis
- Docker (optional)

### Local Development

```bash
# Create virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Download NLP models
python -m spacy download en_core_web_sm

# Set environment variables
cp .env.example .env
# Edit .env with your credentials

# Start Redis (required for Celery)
docker run -d -p 6379:6379 redis:alpine

# Start FastAPI server
uvicorn app.main:app --reload --port 8000

# Start Celery worker (in another terminal)
celery -A app.workers.celery_app worker --loglevel=info
```

### Docker Deployment

```bash
docker-compose up --build
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/ingest` | Submit ingestion job |
| GET | `/jobs` | List all jobs |
| GET | `/jobs/{job_id}` | Get job status |
| GET | `/insights/{job_id}` | Get processed insights |
| GET | `/events/stream` | SSE event stream |
| GET | `/health` | Health check |

## Project Structure

```
backend/
├── app/
│   ├── main.py           # FastAPI entry point
│   ├── config.py         # Settings
│   ├── api/
│   │   ├── routes/       # API endpoints
│   │   └── deps.py       # Dependencies
│   ├── models/           # Database & Pydantic models
│   ├── services/         # Business logic
│   └── workers/          # Celery tasks
├── tests/
├── requirements.txt
├── Dockerfile
└── docker-compose.yml
```

## Environment Variables

```env
DATABASE_URL=postgresql://...
REDIS_URL=redis://localhost:6379
API_SECRET_KEY=your-secret-key
MEILISEARCH_URL=http://localhost:7700
MEILISEARCH_KEY=your-meilisearch-key
```
