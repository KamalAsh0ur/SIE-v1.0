# NLP & OCR Configuration Guide

## Quick Setup

```bash
cd /Volumes/Untitled/SIE-v1.0/backend

# Install NLP dependencies
pip install spacy vaderSentiment langdetect

# Download spaCy model
python -m spacy download en_core_web_sm

# Install OCR dependencies
pip install easyocr pytesseract

# Install image preprocessing
pip install opencv-python numpy Pillow
```

---

## NLP Configuration

### Available spaCy Models

| Model | Size | Accuracy | Speed |
|-------|------|----------|-------|
| `en_core_web_sm` | 12MB | Good | Fast |
| `en_core_web_md` | 40MB | Better | Medium |
| `en_core_web_lg` | 560MB | Best | Slower |

### Environment Variables

```env
# backend/.env

# spaCy model name
NLP_MODEL=en_core_web_sm

# Batch size for processing
NLP_BATCH_SIZE=100

# Sentiment threshold (compound score for neutral detection)
NLP_SENTIMENT_THRESHOLD=0.05
```

### NLP Pipeline Features

| Feature | Library | Output |
|---------|---------|--------|
| Named Entities | spaCy | `[{type, name, confidence}]` |
| Sentiment | VADER | `{type, score, confidence}` |
| Language | langdetect | `{code, confidence}` |
| Keywords | Custom | `[keyword]` |
| Topics | Rule-based | `[topic]` |
| Spam | Keyword | `boolean` |

### Multilingual Support

For non-English text, download additional models:

```bash
# French
python -m spacy download fr_core_news_sm

# Spanish  
python -m spacy download es_core_news_sm

# German
python -m spacy download de_core_news_sm
```

---

## OCR Configuration

### Environment Variables

```env
# backend/.env

# Languages to support (comma-separated)
OCR_LANGUAGES=en

# Use GPU acceleration (requires CUDA)
OCR_GPU=false

# Enable image preprocessing
OCR_PREPROCESS=true

# Preprocessing quality: fast, balanced, best
OCR_PREPROCESS_QUALITY=balanced

# Minimum confidence threshold
OCR_CONFIDENCE_THRESHOLD=0.5

# Use Tesseract as fallback
OCR_FALLBACK_ENABLED=true
```

### Preprocessing Quality Levels

| Level | Speed | Features |
|-------|-------|----------|
| `fast` | Fastest | Contrast only |
| `balanced` | Medium | Denoise + contrast + deskew |
| `best` | Slowest | All preprocessing |

### EasyOCR Languages

Common language codes:
- `en` - English
- `ar` - Arabic
- `zh_sim` - Chinese Simplified
- `fr` - French
- `de` - German
- `es` - Spanish

Multiple languages:
```env
OCR_LANGUAGES=en,ar,fr
```

### GPU Acceleration

For GPU support:

```bash
# Install CUDA-enabled PyTorch
pip install torch torchvision --index-url https://download.pytorch.org/whl/cu118

# Enable in .env
OCR_GPU=true
```

---

## Testing Configuration

### Test NLP

```python
# In Python shell
from app.services.nlp_service import get_nlp_service

nlp = get_nlp_service()
result = nlp.analyze("I love this product! Great quality.")

print(result["sentiment"])  # {'type': 'positive', 'score': 0.8, ...}
print(result["entities"])   # [...]
print(result["language"])   # {'code': 'en', 'confidence': 0.99}
```

### Test OCR

```python
from app.services.ocr_service import get_ocr_service

ocr = get_ocr_service(preprocess=True)
result = ocr.extract_text(["https://example.com/image.jpg"])

print(result["text"])       # Extracted text
print(result["confidence"]) # 0.0-1.0
```

---

## Performance Tuning

### Low Memory Systems

```env
NLP_MODEL=en_core_web_sm
NLP_BATCH_SIZE=50
OCR_GPU=false
OCR_PREPROCESS_QUALITY=fast
```

### High Performance Systems

```env
NLP_MODEL=en_core_web_lg
NLP_BATCH_SIZE=200
OCR_GPU=true
OCR_PREPROCESS_QUALITY=best
```

---

## Troubleshooting

### "No module named 'spacy'"
```bash
pip install spacy
python -m spacy download en_core_web_sm
```

### "EasyOCR model download failed"
```bash
# EasyOCR downloads models on first use
# Ensure internet connection and try again
python -c "import easyocr; easyocr.Reader(['en'])"
```

### "Tesseract not found"
```bash
# macOS
brew install tesseract

# Ubuntu
sudo apt install tesseract-ocr

# Windows
# Download from: https://github.com/UB-Mannheim/tesseract/wiki
```

### OCR Low Accuracy
1. Increase preprocessing quality: `OCR_PREPROCESS_QUALITY=best`
2. Use GPU if available
3. Ensure images are high resolution (>1000px)

---

## Full .env Example

```env
# Database
DATABASE_URL=sqlite:///./sie_dev.db

# Redis
REDIS_URL=redis://localhost:6379

# NLP
NLP_MODEL=en_core_web_sm
NLP_BATCH_SIZE=100
NLP_SENTIMENT_THRESHOLD=0.05

# OCR
OCR_LANGUAGES=en
OCR_GPU=false
OCR_PREPROCESS=true
OCR_PREPROCESS_QUALITY=balanced
OCR_CONFIDENCE_THRESHOLD=0.5
OCR_FALLBACK_ENABLED=true

# Meilisearch
MEILISEARCH_URL=http://localhost:7700

# Environment
ENVIRONMENT=development
DEBUG=true
```
