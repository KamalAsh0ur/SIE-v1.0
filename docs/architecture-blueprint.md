# SIE System Architecture Blueprint
## Smart Ingestion Engine v1.0

---

## 1. High-Level Architecture

```mermaid
graph TB
    subgraph "Platform Layer"
        PLATFORM[SocialListen Platform]
    end
    
    subgraph "SIE API Gateway"
        API[FastAPI Server<br/>Port 8000]
        AUTH[API Key Auth]
    end
    
    subgraph "Message Queue"
        REDIS[(Redis<br/>Port 6379)]
        DLQ[Dead Letter Queue]
    end
    
    subgraph "Worker Pool"
        W1[Celery Worker 1]
        W2[Celery Worker 2]
        W3[Celery Worker N]
    end
    
    subgraph "Processing Engines"
        NLP[NLP Engine<br/>spaCy + VADER]
        OCR[OCR Engine<br/>EasyOCR]
        SCRAPER[Scraper Engine]
    end
    
    subgraph "Hot Storage"
        POSTGRES[(PostgreSQL<br/>Primary DB)]
        MEILI[(Meilisearch<br/>Search Index)]
    end
    
    subgraph "Cold Storage"
        ARCHIVE[(R2/B2<br/>Archive)]
    end
    
    subgraph "Event Streaming"
        SSE[SSE Server]
    end
    
    PLATFORM -->|POST /ingest| API
    API --> AUTH
    AUTH -->|Enqueue| REDIS
    REDIS -->|Failed| DLQ
    REDIS --> W1 & W2 & W3
    W1 & W2 & W3 --> NLP & OCR & SCRAPER
    NLP & OCR --> POSTGRES
    SCRAPER --> NLP
    POSTGRES --> MEILI
    POSTGRES -.->|Archive| ARCHIVE
    W1 & W2 & W3 -->|Events| SSE
    SSE -->|Stream| PLATFORM
    PLATFORM -->|GET /insights| API
    API --> POSTGRES & MEILI
```

---

## 2. Ingestion Flow

```mermaid
sequenceDiagram
    participant P as Platform
    participant A as API Gateway
    participant Q as Redis Queue
    participant W as Celery Worker
    participant S as Scraper
    participant N as NLP Engine
    participant O as OCR Engine
    participant D as PostgreSQL
    participant E as SSE Stream
    
    P->>A: POST /ingest
    A->>A: Validate Payload
    A->>Q: Enqueue Job
    A->>P: 201 {job_id, accepted_at}
    A->>E: Emit job.accepted
    
    Q->>W: Dequeue Job
    W->>E: Emit processing.started
    
    alt Has Items
        W->>W: Use provided items
    else Needs Scraping
        W->>S: Fetch content
        S->>W: Return items[]
    end
    
    loop For each item
        W->>N: Analyze text
        N->>W: {sentiment, entities, topics}
        alt Has Images
            W->>O: Extract text
            O->>W: {ocr_text, confidence}
        end
        W->>E: Emit partial_result
    end
    
    W->>W: Deduplicate
    W->>W: Classify spam
    W->>W: Normalize
    W->>D: Store insights
    W->>E: Emit job.completed
```

---

## 3. Queue & Workers Topology

```mermaid
graph LR
    subgraph "Redis Broker"
        Q1[ingestion<br/>High Priority]
        Q2[nlp<br/>Normal Priority]
        Q3[ocr<br/>Normal Priority]
        DLQ[dead_letter<br/>Failed Jobs]
    end
    
    subgraph "Worker Pool"
        W1[Worker 1<br/>General]
        W2[Worker 2<br/>General]
        W3[Worker 3<br/>NLP Dedicated]
        W4[Worker 4<br/>OCR Dedicated]
    end
    
    Q1 --> W1 & W2
    Q2 --> W3
    Q3 --> W4
    
    W1 -.->|3 retries failed| DLQ
    W2 -.->|3 retries failed| DLQ
```

### Queue Configuration

| Queue | Priority | Concurrency | Timeout | Retries |
|-------|----------|-------------|---------|---------|
| `ingestion` | High (10) | 4 workers | 10 min | 3 |
| `nlp` | Normal (5) | 2 workers | 5 min | 3 |
| `ocr` | Normal (5) | 2 workers | 5 min | 3 |
| `dead_letter` | Low (1) | 1 worker | - | 0 |

---

## 4. NLP/OCR Pipeline

```mermaid
graph TB
    subgraph "Input"
        RAW[Raw Content]
    end
    
    subgraph "Preprocessing"
        CLEAN[Text Cleaning]
        NORM[Normalization]
    end
    
    subgraph "NLP Pipeline"
        LANG[Language Detection<br/>langdetect]
        SENT[Sentiment Analysis<br/>VADER]
        NER[Named Entity Recognition<br/>spaCy]
        TOPIC[Topic Classification<br/>Rule-based]
        SPAM[Spam Detection<br/>Keyword matching]
        KW[Keyword Extraction<br/>TF-IDF-like]
    end
    
    subgraph "OCR Pipeline"
        IMG[Image URLs]
        DOWNLOAD[Download Images]
        PREPROC[Preprocess<br/>Denoise/Resize]
        EASYOCR[EasyOCR<br/>Primary]
        TESS[Tesseract<br/>Fallback]
        CONF[Confidence Check]
    end
    
    subgraph "Output"
        RESULT[Enriched Content]
    end
    
    RAW --> CLEAN --> NORM
    NORM --> LANG --> SENT --> NER --> TOPIC --> SPAM --> KW
    KW --> RESULT
    
    IMG --> DOWNLOAD --> PREPROC --> EASYOCR
    EASYOCR -->|confidence < 0.5| TESS
    EASYOCR -->|confidence >= 0.5| CONF
    TESS --> CONF
    CONF --> RESULT
```

### NLP Performance Targets

| Component | Accuracy | Latency (p95) | Throughput |
|-----------|----------|---------------|------------|
| Language | 95%+ | < 10ms | 1000/s |
| Sentiment | 85%+ | < 50ms | 500/s |
| NER | 80%+ | < 100ms | 200/s |
| Topics | 75%+ | < 20ms | 500/s |

### OCR Performance Targets

| Component | Accuracy | Latency (p95) | Notes |
|-----------|----------|---------------|-------|
| EasyOCR | 90%+ | < 2s | Primary engine |
| Tesseract | 80%+ | < 1s | Fallback only |

---

## 5. Storage Layout

```mermaid
graph TB
    subgraph "Hot Storage (Fast Access)"
        PG[(PostgreSQL)]
        MEILI[(Meilisearch)]
        REDIS[(Redis Cache)]
    end
    
    subgraph "Cold Storage (Archive)"
        R2[(Cloudflare R2)]
    end
    
    subgraph "Tables"
        JOBS[ingestion_jobs]
        INSIGHTS[insights]
        EVENTS[pipeline_events]
        CLIENTS[api_clients]
    end
    
    PG --> JOBS & INSIGHTS & EVENTS & CLIENTS
    INSIGHTS -->|Sync| MEILI
    INSIGHTS -->|>90 days| R2
```

### Retention Policy

| Storage | Data | Retention | Purpose |
|---------|------|-----------|---------|
| PostgreSQL | Jobs | 90 days | Active queries |
| PostgreSQL | Insights | 90 days | API access |
| PostgreSQL | Events | 7 days | Debugging |
| Meilisearch | Insights | 90 days | Full-text search |
| R2/B2 | Archive | 2 years | Compliance |

---

## 6. Event Streaming

```mermaid
sequenceDiagram
    participant W as Worker
    participant P as Pub/Sub
    participant S as SSE Server
    participant C as Client
    
    C->>S: GET /events/stream
    S->>C: Connection established
    
    loop Heartbeat
        S->>C: : heartbeat
    end
    
    W->>P: Publish event
    P->>S: Forward event
    S->>C: event: {type}\ndata: {json}
    
    Note over C: Client processes event
    
    alt Connection lost
        C->>S: Reconnect with last_event_id
        S->>C: Replay missed events
    end
```

### Event Types

| Event | Stage | Payload |
|-------|-------|---------|
| `job.accepted` | Ingestion | `{job_id, tenant, accepted_at}` |
| `processing.started` | Processing | `{job_id, stage}` |
| `partial_result` | Processing | `{job_id, items_processed}` |
| `nlp.completed` | Enrichment | `{job_id, items_count}` |
| `ocr.completed` | Enrichment | `{job_id, images_processed}` |
| `job.completed` | Complete | `{job_id, insights_count, time_ms}` |
| `job.failed` | Error | `{job_id, error, retry_count}` |

---

## 7. Deployment Architecture

```mermaid
graph TB
    subgraph "Container Orchestration"
        subgraph "API Tier"
            API1[API Instance 1]
            API2[API Instance 2]
        end
        
        subgraph "Worker Tier"
            W1[Worker 1]
            W2[Worker 2]
            W3[Worker 3]
        end
        
        subgraph "Data Tier"
            PG[(PostgreSQL)]
            REDIS[(Redis)]
            MEILI[(Meilisearch)]
        end
    end
    
    LB[Load Balancer] --> API1 & API2
    API1 & API2 --> REDIS
    REDIS --> W1 & W2 & W3
    W1 & W2 & W3 --> PG
    PG --> MEILI
```

### Resource Allocation (MVP)

| Service | CPU | Memory | Replicas |
|---------|-----|--------|----------|
| API | 0.5 | 512MB | 2 |
| Worker | 1.0 | 2GB | 3 |
| PostgreSQL | 1.0 | 1GB | 1 |
| Redis | 0.25 | 256MB | 1 |
| Meilisearch | 0.5 | 512MB | 1 |

---

## 8. Security Architecture

```mermaid
graph TB
    subgraph "External"
        CLIENT[API Client]
    end
    
    subgraph "Security Layer"
        TLS[TLS 1.3]
        AUTH[API Key Validation]
        RATE[Rate Limiter]
    end
    
    subgraph "Internal"
        API[FastAPI]
        WORKER[Workers]
        DB[(Database)]
    end
    
    CLIENT -->|HTTPS| TLS
    TLS --> AUTH
    AUTH --> RATE
    RATE --> API
    API -->|Internal Network| WORKER
    WORKER -->|Encrypted| DB
```

### Security Controls

| Layer | Control | Implementation |
|-------|---------|----------------|
| Transport | TLS 1.3 | Load balancer termination |
| Authentication | API Keys | X-API-Key header |
| Authorization | Tenant isolation | Row-level filtering |
| Rate Limiting | Per-client | Redis token bucket |
| Data | Field encryption | PII redaction |

---

## References

- [Microservices Architecture](https://martinfowler.com/articles/microservices.html)
- [Celery Best Practices](https://docs.celeryq.dev/en/stable/userguide/tasks.html)
- [spaCy Pipelines](https://spacy.io/usage/processing-pipelines)
- [Meilisearch Docs](https://www.meilisearch.com/docs)
