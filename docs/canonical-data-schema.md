# SIE Canonical Data Schema v1.0
## Smart Ingestion Engine - Normalized Post Format

---

## 1. Overview

This document defines the canonical data schema for all content processed by SIE. All data, regardless of source (API, scraper, or direct submission), must be transformed into this format before storage and indexing.

### Schema Evolution Strategy

- **Versioning**: Schema version is embedded in each record
- **Backward Compatibility**: New fields are always optional
- **Migration**: Version migrations handled at read-time
- **Deprecation**: Fields marked deprecated for 2 versions before removal

---

## 2. NormalizedPost Schema

### Core Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `post_id` | UUID | ✅ | Unique identifier for this post |
| `job_id` | UUID | ✅ | Parent ingestion job ID |
| `tenant` | string | ✅ | Tenant/customer identifier |
| `schema_version` | string | ✅ | Schema version (e.g., "1.0") |

### Content Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `content_text` | string | ✅ | Main text content (max 50KB) |
| `content_html` | string | ❌ | Original HTML if available |
| `ocr_text` | string | ❌ | Text extracted from images via OCR |
| `language` | string | ✅ | ISO 639-1 language code |
| `word_count` | integer | ✅ | Number of words in content |
| `char_count` | integer | ✅ | Number of characters |

### Author Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `author.id` | string | ❌ | Platform-specific author ID |
| `author.name` | string | ❌ | Display name |
| `author.username` | string | ❌ | Username/handle |
| `author.verified` | boolean | ❌ | Is account verified |
| `author.followers` | integer | ❌ | Follower count at time of fetch |

### Sentiment Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `sentiment.type` | enum | ✅ | `positive`, `negative`, `neutral`, `mixed` |
| `sentiment.score` | float | ✅ | -1.0 to 1.0 compound score |
| `sentiment.confidence` | float | ✅ | 0.0 to 1.0 confidence |
| `sentiment.breakdown.positive` | float | ❌ | Positive score component |
| `sentiment.breakdown.negative` | float | ❌ | Negative score component |
| `sentiment.breakdown.neutral` | float | ❌ | Neutral score component |

### Entity Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `entities` | array | ✅ | List of extracted entities |
| `entities[].type` | enum | ✅ | `person`, `organization`, `location`, `product`, `event`, `date`, `money`, `other` |
| `entities[].name` | string | ✅ | Entity text |
| `entities[].confidence` | float | ✅ | 0.0 to 1.0 |
| `entities[].normalized` | string | ❌ | Normalized/canonical form |
| `entities[].metadata` | object | ❌ | Additional entity data |

### Topic Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `topics` | array | ✅ | Detected topics (max 10) |
| `topics[].name` | string | ✅ | Topic label |
| `topics[].confidence` | float | ✅ | 0.0 to 1.0 |
| `keywords` | array | ✅ | Extracted keywords (max 20) |

### Media Metadata

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `media` | array | ❌ | Attached media objects |
| `media[].type` | enum | ✅ | `image`, `video`, `link`, `document` |
| `media[].url` | string | ✅ | Media URL |
| `media[].thumbnail` | string | ❌ | Thumbnail URL |
| `media[].width` | integer | ❌ | Width in pixels |
| `media[].height` | integer | ❌ | Height in pixels |
| `media[].duration` | integer | ❌ | Duration in seconds (video) |
| `media[].ocr_text` | string | ❌ | OCR extracted from this media |
| `media[].alt_text` | string | ❌ | Image alt text |

### Provenance Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `provenance.source_url` | string | ✅ | Original content URL |
| `provenance.platform` | enum | ✅ | `twitter`, `reddit`, `linkedin`, `instagram`, `youtube`, `facebook`, `web`, `custom` |
| `provenance.fetch_method` | enum | ✅ | `api`, `scraper`, `webhook`, `manual` |
| `provenance.fetched_at` | datetime | ✅ | ISO 8601 timestamp |
| `provenance.original_id` | string | ❌ | Platform-specific post ID |
| `provenance.robots_allowed` | boolean | ❌ | Was scraping allowed by robots.txt |
| `provenance.ip_address` | string | ❌ | Fetcher IP (for audit) |

### Quality & Confidence

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `confidence.overall` | float | ✅ | Overall confidence score 0.0-1.0 |
| `confidence.sentiment` | float | ✅ | Sentiment confidence |
| `confidence.language` | float | ✅ | Language detection confidence |
| `confidence.entities` | float | ✅ | NER confidence |
| `confidence.topics` | float | ✅ | Topic classification confidence |
| `confidence.ocr` | float | ❌ | OCR extraction confidence |
| `is_spam` | boolean | ✅ | Flagged as spam |
| `is_duplicate` | boolean | ✅ | Flagged as duplicate |
| `duplicate_of` | UUID | ❌ | Original post if duplicate |
| `quality_score` | float | ❌ | Text quality score 0.0-1.0 |

### Engagement Metrics

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `engagement.likes` | integer | ❌ | Like/favorite count |
| `engagement.shares` | integer | ❌ | Share/retweet count |
| `engagement.comments` | integer | ❌ | Comment/reply count |
| `engagement.views` | integer | ❌ | View count |
| `engagement.engagement_rate` | float | ❌ | Calculated engagement rate |

### Timestamps

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `published_at` | datetime | ❌ | Original publish time |
| `created_at` | datetime | ✅ | Record creation time |
| `processed_at` | datetime | ✅ | NLP processing completion |
| `updated_at` | datetime | ✅ | Last update time |
| `archived_at` | datetime | ❌ | When moved to cold storage |

---

## 3. JSON Schema Definition

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "https://sie.example.com/schemas/normalized-post/v1.0",
  "title": "NormalizedPost",
  "type": "object",
  "required": [
    "post_id", "job_id", "tenant", "schema_version",
    "content_text", "language", "word_count", "char_count",
    "sentiment", "entities", "topics", "keywords",
    "provenance", "confidence", "is_spam", "is_duplicate",
    "created_at", "processed_at", "updated_at"
  ],
  "properties": {
    "post_id": { "type": "string", "format": "uuid" },
    "job_id": { "type": "string", "format": "uuid" },
    "tenant": { "type": "string", "minLength": 1, "maxLength": 255 },
    "schema_version": { "type": "string", "pattern": "^\\d+\\.\\d+$" },
    "content_text": { "type": "string", "maxLength": 51200 },
    "sentiment": {
      "type": "object",
      "required": ["type", "score", "confidence"],
      "properties": {
        "type": { "enum": ["positive", "negative", "neutral", "mixed"] },
        "score": { "type": "number", "minimum": -1, "maximum": 1 },
        "confidence": { "type": "number", "minimum": 0, "maximum": 1 }
      }
    },
    "entities": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["type", "name", "confidence"],
        "properties": {
          "type": { "type": "string" },
          "name": { "type": "string" },
          "confidence": { "type": "number", "minimum": 0, "maximum": 1 }
        }
      }
    }
  }
}
```

---

## 4. Database Schema (PostgreSQL)

```sql
CREATE TABLE insights (
    -- Core
    post_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID NOT NULL REFERENCES ingestion_jobs(id),
    tenant VARCHAR(255) NOT NULL,
    schema_version VARCHAR(10) NOT NULL DEFAULT '1.0',
    
    -- Content
    content_text TEXT NOT NULL,
    content_html TEXT,
    ocr_text TEXT,
    language VARCHAR(10) NOT NULL DEFAULT 'en',
    word_count INTEGER NOT NULL DEFAULT 0,
    char_count INTEGER NOT NULL DEFAULT 0,
    
    -- Author (JSONB for flexibility)
    author JSONB DEFAULT '{}',
    
    -- NLP Results
    sentiment_type VARCHAR(20) NOT NULL DEFAULT 'neutral',
    sentiment_score DECIMAL(5,4),
    sentiment_confidence DECIMAL(3,2),
    sentiment_breakdown JSONB DEFAULT '{}',
    
    entities JSONB NOT NULL DEFAULT '[]',
    topics TEXT[] NOT NULL DEFAULT '{}',
    keywords TEXT[] NOT NULL DEFAULT '{}',
    
    -- Media
    media JSONB DEFAULT '[]',
    
    -- Provenance
    source_url TEXT,
    platform VARCHAR(50) NOT NULL,
    fetch_method VARCHAR(50) NOT NULL,
    original_id VARCHAR(255),
    fetched_at TIMESTAMPTZ NOT NULL,
    
    -- Quality
    confidence JSONB NOT NULL DEFAULT '{}',
    is_spam BOOLEAN NOT NULL DEFAULT false,
    is_duplicate BOOLEAN NOT NULL DEFAULT false,
    duplicate_of UUID REFERENCES insights(post_id),
    quality_score DECIMAL(3,2),
    
    -- Engagement
    engagement JSONB DEFAULT '{}',
    
    -- Timestamps
    published_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    archived_at TIMESTAMPTZ,
    
    -- Indexes
    CONSTRAINT valid_sentiment CHECK (sentiment_type IN ('positive', 'negative', 'neutral', 'mixed'))
);

-- Indexes for common queries
CREATE INDEX idx_insights_job ON insights(job_id);
CREATE INDEX idx_insights_tenant ON insights(tenant);
CREATE INDEX idx_insights_sentiment ON insights(sentiment_type);
CREATE INDEX idx_insights_platform ON insights(platform);
CREATE INDEX idx_insights_published ON insights(published_at DESC);
CREATE INDEX idx_insights_spam ON insights(is_spam) WHERE is_spam = false;
CREATE INDEX idx_insights_topics ON insights USING GIN(topics);
CREATE INDEX idx_insights_keywords ON insights USING GIN(keywords);
CREATE INDEX idx_insights_entities ON insights USING GIN(entities);
```

---

## 5. Meilisearch Index Mapping

```json
{
  "uid": "insights",
  "primaryKey": "post_id",
  "searchableAttributes": [
    "content_text",
    "ocr_text",
    "topics",
    "keywords",
    "entities.name",
    "author.name"
  ],
  "filterableAttributes": [
    "tenant",
    "job_id",
    "sentiment_type",
    "platform",
    "language",
    "is_spam",
    "is_duplicate",
    "published_at",
    "created_at"
  ],
  "sortableAttributes": [
    "created_at",
    "published_at",
    "sentiment_score",
    "quality_score"
  ],
  "rankingRules": [
    "words",
    "typo",
    "proximity",
    "attribute",
    "sort",
    "exactness",
    "quality_score:desc"
  ]
}
```

---

## 6. Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2025-02-12 | Initial schema release |

---

## References

- [Schema Evolution Best Practices](https://docs.confluent.io/platform/current/schema-registry/schema_evolution.html)
- [JSON Schema Specification](https://json-schema.org/)
- [PostgreSQL JSONB Documentation](https://www.postgresql.org/docs/current/datatype-json.html)
