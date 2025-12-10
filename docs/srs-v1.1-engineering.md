# Software Requirements Specification (SRS)
# Smart Ingestion Engine (SIE)
# Version 1.1 — Engineering Ready
# Date: 12 Feb 2025 (Updated)

---

## 1. Introduction

### 1.1 Purpose
The Smart Ingestion Engine (SIE) is a backend service responsible for ingesting, normalizing, enriching, and indexing data from multiple social and web sources. This SRS defines the complete functional and non-functional requirements for the MVP release.

### 1.2 Scope
SIE performs all heavy-duty processing including ingestion, NLP, OCR, deduplication, normalization, indexing, storage, and insights generation. The Platform communicates with SIE exclusively via APIs.

### 1.3 Definitions
| Term | Definition |
|------|------------|
| Platform | Main user-facing SocialListen application |
| SIE | Smart Ingestion Engine (this service) |
| NLP | Natural Language Processing |
| OCR | Optical Character Recognition |
| DLQ | Dead Letter Queue |
| Hot Storage | PostgreSQL + Meilisearch (fast access) |
| Cold Storage | R2/B2 archive (long-term) |

---

## 2. System Overview

### 2.1 Responsibilities
- Receive ingestion jobs from the Platform
- Ingest data from non-API sources using scrapers
- Process all API-sourced data forwarded from the Platform
- Normalize all data into canonical schema v1.0
- Perform enrichment (NLP + OCR)
- Store and index insights
- Serve insights via API
- Emit real-time job status and result events

### 2.2 Design Principles
- **Isolation**: SIE operates independently; Platform never performs data enrichment
- **Idempotency**: All operations can be safely retried
- **Observability**: Comprehensive logging and metrics
- **Resilience**: Graceful degradation under load

---

## 3. Functional Requirements

### 3.1 Ingestion Endpoint

**Endpoint:** `POST /ingest`

#### Request Payload
```json
{
  "source_type": "meta_api | youtube_api | scraped",
  "items": [
    {
      "id": "string",
      "content": "string",
      "url": "string",
      "author": "string",
      "timestamp": "ISO8601"
    }
  ],
  "accounts": ["@username", "r/subreddit"],
  "keywords": ["keyword1", "keyword2"],
  "date_range": {
    "start": "ISO8601",
    "end": "ISO8601"
  },
  "mode": "historical | realtime | scheduled",
  "tenant": "string",
  "priority": "low | normal | high"
}
```

#### Success Response (201)
```json
{
  "job_id": "UUID",
  "accepted_at": "ISO8601",
  "status": "queued",
  "estimated_duration_ms": 30000
}
```

#### Error Responses
| Code | Error | Description |
|------|-------|-------------|
| 400 | `INVALID_PAYLOAD` | Malformed request body |
| 400 | `MISSING_CONTENT` | No items, accounts, or keywords |
| 401 | `UNAUTHORIZED` | Invalid or missing API key |
| 429 | `RATE_LIMITED` | Request limit exceeded |
| 503 | `QUEUE_UNAVAILABLE` | Message broker unavailable |

#### Validation Rules
- `source_type` must be one of: `meta_api`, `youtube_api`, `scraped`
- At least one of `items`, `accounts`, or `keywords` required
- `tenant` is required (max 255 chars)
- `priority` defaults to `normal`
- `mode` defaults to `realtime`
- Maximum 10,000 items per batch

#### Rate Limits
| Priority | Requests/min | Max Concurrent |
|----------|-------------|----------------|
| low | 10 | 5 |
| normal | 30 | 10 |
| high | 60 | 20 |

---

### 3.2 Job Lifecycle

```
┌──────────┐     ┌───────────┐     ┌────────────┐     ┌───────────┐     ┌───────────┐
│ PENDING  │ ──▶ │ INGESTING │ ──▶ │ PROCESSING │ ──▶ │ ENRICHING │ ──▶ │ COMPLETED │
└──────────┘     └───────────┘     └────────────┘     └───────────┘     └───────────┘
     │                │                  │                  │
     └────────────────┴──────────────────┴──────────────────┴────────▶ ┌────────┐
                                      (on error)                       │ FAILED │
                                                                       └────────┘
```

#### Stage Definitions

| Stage | Description | Timeout | Retryable |
|-------|-------------|---------|-----------|
| `pending` | Job queued, awaiting worker | 5 min | N/A |
| `ingesting` | Fetching content from sources | 10 min | Yes |
| `processing` | NLP analysis in progress | 10 min | Yes |
| `enriching` | OCR and final enrichment | 5 min | Yes |
| `completed` | Successfully finished | N/A | N/A |
| `failed` | Permanent failure after retries | N/A | No |

#### Progress Tracking
- Progress reported as percentage (0-100)
- Updated after each item processed
- `items_processed` / `items_total` tracked

---

### 3.3 Retry Logic & Dead Letter Queue

#### Retry Policy
```yaml
max_retries: 3
retry_intervals:
  - 60s    # 1st retry after 1 minute
  - 300s   # 2nd retry after 5 minutes
  - 900s   # 3rd retry after 15 minutes
exponential_backoff: true
jitter: true  # ±10% randomization
```

#### Retryable Errors
| Error Type | Retry | Notes |
|-----------|-------|-------|
| Network timeout | Yes | External service unavailable |
| Rate limit (429) | Yes | With exponential backoff |
| Worker crash | Yes | Job returns to queue |
| Memory overflow | Yes | Single item, restart worker |
| Invalid content | No | Log and skip item |
| Auth failure | No | Fail immediately |
| Validation error | No | Bad input data |

#### Dead Letter Queue (DLQ)
Jobs that fail all retries are moved to DLQ:

```json
{
  "original_job": { ... },
  "error": {
    "type": "MAX_RETRIES_EXCEEDED",
    "message": "Failed after 3 attempts",
    "last_error": "Scraper blocked by target site",
    "stack_trace": "..."
  },
  "attempts": [
    { "timestamp": "...", "error": "..." },
    { "timestamp": "...", "error": "..." },
    { "timestamp": "...", "error": "..." }
  ],
  "dlq_timestamp": "ISO8601"
}
```

#### DLQ Processing
- DLQ reviewed daily (automated alert)
- Manual replay available via admin API
- Jobs auto-deleted from DLQ after 30 days
- Metric: `dlq_depth` always < 100 for healthy system

---

### 3.4 Scraper Connectors (§3.2 Expanded)

#### Connector Interface
Each scraper must implement:
```python
class BaseConnector:
    def fetch(self, target: str) -> List[RawContent]
    def parse(self, raw: bytes) -> ParsedContent
    def rate_limiter(self) -> RateLimiter
    def health_check(self) -> bool
```

#### Rate Limiting Controls
| Platform | Requests/sec | Burst | Backoff |
|----------|-------------|-------|---------|
| Generic Web | 1.0 | 5 | 2x |
| Reddit | 0.5 | 3 | 2x |
| Twitter (legacy) | 0.2 | 1 | 4x |

#### Crawl Budget
- Maximum 1000 pages per job
- Maximum 10MB total content per job
- Maximum 5 images per post for OCR
- Budget tracked per tenant per day

#### robots.txt Compliance
- Robots.txt fetched and cached (1 hour)
- Disallowed paths skipped with logging
- User-agent: `SIE-Bot/1.0 (+https://sie.example.com/bot)`
- Crawl-delay respected (minimum 1s)

#### Provenance Metadata (Required)
```json
{
  "source_url": "https://...",
  "fetched_at": "ISO8601",
  "fetch_method": "scraper",
  "robots_allowed": true,
  "response_code": 200,
  "content_type": "text/html",
  "encoding": "utf-8",
  "ip_address": "fetcher IP",
  "user_agent": "SIE-Bot/1.0"
}
```

---

### 3.5 Processing Pipeline (§3.3 Expanded)

#### Pipeline Stages

| Stage | Engine | Input | Output |
|-------|--------|-------|--------|
| Language | langdetect | text | `{code, confidence}` |
| Sentiment | VADER | text | `{type, score, confidence}` |
| NER | spaCy | text | `[{type, name, confidence}]` |
| Topics | Rule-based | text + keywords | `[topic_name]` |
| Keywords | TF-IDF | text | `[keyword]` |
| Spam | Keyword + ML | text | `boolean` |
| OCR | EasyOCR | images | `{text, confidence}` |

#### Deduplication
- **Exact**: Content hash (first 500 chars)
- **Near**: SimHash with threshold 0.9
- **Policy**: Keep first, mark duplicates

#### Spam Classification
```python
SPAM_INDICATORS = [
    "buy now", "click here", "limited offer",
    "act now", "free money", "winner"
]
# Confidence: 0.0-0.5 = not spam, 0.5-1.0 = spam
```

#### Normalization
All data transformed to canonical schema v1.0 (see separate doc).

---

### 3.6 Insight Retrieval API (§3.4 Expanded)

**Endpoint:** `GET /insights/{job_id}`

#### Query Parameters
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `page` | int | 1 | Page number |
| `limit` | int | 50 | Items per page (max 200) |
| `sentiment` | enum | - | Filter by sentiment |
| `topic` | string | - | Filter by topic |
| `language` | string | - | Filter by language code |
| `exclude_spam` | bool | true | Exclude spam posts |
| `exclude_duplicates` | bool | true | Exclude duplicates |

#### Response
```json
{
  "results": [
    {
      "post_id": "UUID",
      "content_text": "...",
      "sentiment": { "type": "positive", "score": 0.85 },
      "entities": [...],
      "topics": [...],
      "provenance": { ... }
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 1234,
    "total_pages": 25
  },
  "job_status": "complete | partial | error"
}
```

#### Performance Guarantees
| Metric | Target |
|--------|--------|
| Response time (p50) | < 100ms |
| Response time (p95) | < 500ms |
| Response time (p99) | < 1000ms |

---

### 3.7 Event Streaming (§3.5 Expanded)

**Endpoint:** `GET /events/stream` (SSE)

#### Event Types
| Event | Payload |
|-------|---------|
| `job.accepted` | `{job_id, tenant, accepted_at}` |
| `processing.started` | `{job_id, stage}` |
| `partial_result` | `{job_id, items_processed, total}` |
| `nlp.completed` | `{job_id, items_count}` |
| `ocr.completed` | `{job_id, images_count}` |
| `job.completed` | `{job_id, insights_count, time_ms}` |
| `job.failed` | `{job_id, error, retry_count}` |

#### Reconnection Strategy
```javascript
// Client-side reconnection
const connect = (lastEventId = null) => {
  const url = lastEventId 
    ? `/events/stream?last_event_id=${lastEventId}`
    : '/events/stream';
  const es = new EventSource(url);
  es.onerror = () => setTimeout(() => connect(lastEventId), 5000);
  es.onmessage = (e) => { lastEventId = e.lastEventId; };
};
```

---

## 4. Non-Functional Requirements

### 4.1 Performance

| Metric | Target | Measurement |
|--------|--------|-------------|
| Job acceptance | < 2s | API response time |
| NLP per post | < 300ms avg | Worker metrics |
| OCR per image | < 2s avg | Worker metrics |
| Insight query | < 500ms p95 | API metrics |
| Event latency | < 1s | SSE delivery |

### 4.2 Scalability
- Horizontal scaling via worker pool
- Target: 10,000 posts/hour baseline
- Peak: 50,000 posts/hour (burst)
- Queue-based workload distribution

### 4.3 Availability
- Target: 99.5% uptime (MVP)
- Planned maintenance windows: 2AM-4AM UTC Sunday
- Health endpoints for monitoring

### 4.4 Security
- TLS 1.3 for all communication
- API key authentication (X-API-Key header)
- Tenant isolation at data layer
- Field-level PII redaction (configurable)
- Rate limiting per client

### 4.5 Compliance
- robots.txt compliance for scraping
- Audit trail for all scraping activity
- Data retention configurable per tenant
- EU hosting option for GDPR

---

## 5. Tech Stack

| Component | Technology | Version |
|-----------|------------|---------|
| Backend | Python FastAPI | 0.109+ |
| Workers | Celery | 5.3+ |
| Queue | Redis | 7.0+ |
| NLP | spaCy + VADER | 3.7+ |
| OCR | EasyOCR | 1.7+ |
| Database | PostgreSQL | 15+ |
| Search | Meilisearch | 1.6+ |
| Archive | Cloudflare R2 | - |
| Monitoring | Prometheus + Grafana | - |
| Hosting | Fly.io / Railway | - |

---

## 6. Acceptance Tests

### 6.1 Functional Tests

| Test | Criteria | Pass/Fail |
|------|----------|-----------|
| Submit job with items | Returns 201 with job_id | |
| Submit job with accounts | Scrapes and returns job_id | |
| Invalid payload rejected | Returns 400 with error | |
| Job progresses through stages | All stages observed in events | |
| Insights retrievable | GET returns processed data | |
| SSE events received | Client receives all event types | |

### 6.2 Performance Tests

| Test | Criteria | Pass/Fail |
|------|----------|-----------|
| 100 concurrent jobs | No failures | |
| 1000 posts in batch | Completes < 5 minutes | |
| 10 images OCR | Completes < 30 seconds | |
| 10k insight query | Response < 1 second | |

### 6.3 Resilience Tests

| Test | Criteria | Pass/Fail |
|------|----------|-----------|
| Worker restart during job | Job resumes from queue | |
| Network timeout | Retry succeeds | |
| Invalid content in batch | Other items processed | |
| DLQ receives failed jobs | Job appears in DLQ | |

---

## 7. Approval

This SRS serves as the official contract between product and engineering.

**Author:** Kamal Ashour  
**Version:** 1.1 (Engineering Ready)  
**Approved By:** Engineering Leadership

---

*Last Updated: February 2025*
