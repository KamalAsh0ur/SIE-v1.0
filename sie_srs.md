# **Software Requirements Specification (SRS)**
# **Smart Ingestion Engine (SIE)**
# **Version 1.0**
# **Date: 12 Feb 2025**
---

## **1. Introduction**
### **1.1 Purpose**
The Smart Ingestion Engine (SIE) is a backend service responsible for ingesting, normalizing, enriching, and indexing data from multiple social and web sources. This SRS defines the functional and non-functional requirements for designing, building, deploying, and maintaining SIE as an independent service integrated with the SocialListen Platform.

### **1.2 Scope**
The SIE performs all heavy-duty processing including ingestion, NLP, OCR, deduplication, normalization, indexing, storage, and insights generation. The Platform communicates with SIE exclusively via APIs.

### **1.3 Definitions**
- **Platform:** The main user-facing application.
- **SIE:** Smart Ingestion Engine.
- **NLP:** Natural Language Processing.
- **OCR:** Optical Character Recognition.
- **Hot Storage:** Fast searchable storage.
- **Cold Storage:** Long-term archive storage.

---
## **2. System Overview**
The SIE is a standalone backend service with the following responsibilities:
- Receive ingestion jobs from the Platform.
- Ingest data from non-API sources using scrapers.
- Process all API-sourced data forwarded from the Platform.
- Normalize all data into a canonical schema.
- Perform enrichment (NLP + OCR).
- Store and index insights.
- Serve insights via API.
- Emit real-time job status and result events.

The Platform never performs data enrichment. All processing occurs within SIE.

---
## **3. Functional Requirements**

### **3.1 Ingestion Endpoint**
**Endpoint:** `POST /ingest`

#### Description
Platform submits ingestion jobs containing raw API data or metadata for scraping.

#### Payload Structure
```
{
  "source_type": "meta_api | youtube_api | scraped",
  "items": [...],
  "accounts": [...],
  "keywords": [...],
  "date_range": {...},
  "mode": "historical | realtime | scheduled",
  "tenant": "string",
  "priority": "low | normal | high"
}
```

#### Response
```
{
  "job_id": "UUID",
  "accepted_at": "ISO8601"
}
```

#### Requirements
- Must validate payload.
- Must enqueue job asynchronously.
- Must support retries and dead-lettering.

---
### **3.2 Scraper Connectors**
The SIE must implement modular connectors for non-API platforms.

#### Requirements
- Rate-limiting controls.
- robots.txt compliance.
- Structured error handling.
- Provenance metadata: URL, timestamp, fetch_method, confidence.

---
### **3.3 Processing Pipeline**
SIE performs all enrichment using:
- NLP (sentiment, entities, topics, language detection).
- OCR for image text extraction.
- Deduplication.
- Spam classification.
- Canonical normalization.

All processing must run independently of the Platform.

---
### **3.4 Insight Retrieval API**
**Endpoint:** `GET /insights/{job_id}`

#### Response
```
{
  "results": [...],
  "pagination": {...},
  "job_status": "partial | complete | error"
}
```

#### Each normalized post must include
- Post ID
- Content text
- OCR text (optional)
- Sentiment
- Entities
- Topics
- Media metadata
- Provenance
- Confidence scores

---
### **3.5 Event Streaming**
SIE must expose real-time job events via SSE or Pub/Sub.

#### Events
- `job.accepted`
- `partial_result`
- `complete`
- `error`

---
## **4. Non-Functional Requirements (NFRs)**

### **4.1 Performance**
- Ingestion job acceptance < 2 seconds.
- OCR + NLP should process 1 post under 300 ms average.
- Scalable worker pool for ingestion.

### **4.2 Scalability**
- Independent horizontal scaling.
- Queue-based workload distribution.

### **4.3 Availability**
- Target: 99.5% uptime for MVP.

### **4.4 Security**
- TLS for all communication.
- Token-based authentication.
- Field-level encryption for sensitive data.

### **4.5 Compliance**
- Respect platform ToS.
- Maintain audit trails for scraping.
- Automatic PII redaction.

---
## **5. Tech Stack Requirements**

### **5.1 Backend Language**
Python (FastAPI)

### **5.2 NLP Stack**
- spaCy
- VADER
- HuggingFace DistilBERT (CPU mode)
- langdetect / fasttext

### **5.3 OCR Stack**
- EasyOCR or Tesseract

### **5.4 Databases**
- PostgreSQL (primary DB)
- Meilisearch (search index)
- Cloudflare R2 or Backblaze B2 (archival storage)

### **5.5 Queue / Workers**
- Celery + Redis

### **5.6 Hosting**
- Fly.io or Railway (free/low cost)

### **5.7 Observability**
- Prometheus + Grafana
- Sentry (error tracking)

---
## **6. System Architecture**
SIE architecture includes:
- API gateway (FastAPI)
- Worker cluster (Celery)
- Scraper adapter layer
- NLP/OCR pipeline
- Normalization layer
- Storage/indexing layer
- Event streaming

---
## **7. Deployment Requirements**

### **7.1 CI/CD**
- GitHub Actions
- Automated testing + linting

### **7.2 Containerization**
- Docker-based deployment

### **7.3 Environment Separation**
- dev / staging / production

---
## **8. Maintenance & Operations**

### **8.1 Monitoring**
- CPU/RAM usage
- Queue length
- Failed jobs
- Ingestion throughput

### **8.2 Logging**
- Structured logs (JSON)
- Queryable system logs

### **8.3 Recovery**
- Retries and DLQ for ingestion
- Automated worker restart

---
## **9. Future Enhancements (Not part of MVP)**
- Computer Vision (logos, object detection)
- Video frame analysis
- Audio transcription
- Advanced anomaly detection

---
## **10. Approval**
This SRS serves as the official reference for engineers implementing the SIE.

**Author:** Kamal Ashour

**Approved By:** Engineering Leadership

---

