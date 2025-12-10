"""
NLP Service

Performs natural language processing including:
- Sentiment analysis (VADER + DistilBERT)
- Named entity recognition (spaCy)
- Topic extraction
- Keyword extraction
- Language detection

Implements SRS §5.2 requirements.
"""

from typing import List, Optional
import re


class NLPService:
    """
    NLP processing service using local models.
    
    Lazy-loads heavy models to reduce startup time.
    """
    
    _spacy_nlp = None
    _vader_analyzer = None
    _language_detector = None
    
    def __init__(self):
        """Initialize NLP service."""
        pass
    
    @classmethod
    def get_spacy(cls):
        """Lazy-load spaCy model."""
        if cls._spacy_nlp is None:
            try:
                import spacy
                cls._spacy_nlp = spacy.load("en_core_web_sm")
                print("✓ spaCy model loaded")
            except Exception as e:
                print(f"⚠ Could not load spaCy: {e}")
                cls._spacy_nlp = False
        return cls._spacy_nlp if cls._spacy_nlp else None
    
    @classmethod
    def get_vader(cls):
        """Lazy-load VADER sentiment analyzer."""
        if cls._vader_analyzer is None:
            try:
                from vaderSentiment.vaderSentiment import SentimentIntensityAnalyzer
                cls._vader_analyzer = SentimentIntensityAnalyzer()
                print("✓ VADER analyzer loaded")
            except Exception as e:
                print(f"⚠ Could not load VADER: {e}")
                cls._vader_analyzer = False
        return cls._vader_analyzer if cls._vader_analyzer else None
    
    @classmethod
    def get_langdetect(cls):
        """Lazy-load language detector."""
        if cls._language_detector is None:
            try:
                from langdetect import detect, detect_langs
                cls._language_detector = {"detect": detect, "detect_langs": detect_langs}
                print("✓ Language detector loaded")
            except Exception as e:
                print(f"⚠ Could not load langdetect: {e}")
                cls._language_detector = False
        return cls._language_detector if cls._language_detector else None
    
    def analyze(self, text: str) -> dict:
        """
        Perform full NLP analysis on text.
        
        Returns:
            dict with sentiment, entities, topics, keywords, language
        """
        if not text or not text.strip():
            return self._empty_result()
        
        # Clean text
        clean_text = self._clean_text(text)
        
        # Run all analyses
        sentiment = self._analyze_sentiment(clean_text)
        entities = self._extract_entities(clean_text)
        keywords = self._extract_keywords(clean_text)
        topics = self._detect_topics(clean_text, keywords)
        language = self._detect_language(clean_text)
        
        return {
            "sentiment": sentiment,
            "entities": entities,
            "topics": topics,
            "keywords": keywords,
            "language": language,
        }
    
    def _empty_result(self) -> dict:
        """Return empty result structure."""
        return {
            "sentiment": {"type": "neutral", "score": 0.0, "confidence": 0.0},
            "entities": [],
            "topics": [],
            "keywords": [],
            "language": {"code": "unknown", "name": "Unknown", "confidence": 0.0},
        }
    
    def _clean_text(self, text: str) -> str:
        """Clean and normalize text."""
        # Remove URLs
        text = re.sub(r'https?://\S+', '', text)
        # Remove excessive whitespace
        text = re.sub(r'\s+', ' ', text)
        # Remove mentions and hashtags (keep the text)
        text = re.sub(r'[@#](\w+)', r'\1', text)
        return text.strip()
    
    def _analyze_sentiment(self, text: str) -> dict:
        """
        Analyze sentiment using VADER.
        
        VADER is rule-based and works well for social media text.
        """
        vader = self.get_vader()
        
        if vader:
            scores = vader.polarity_scores(text)
            compound = scores['compound']
            
            # Classify sentiment type
            if compound >= 0.05:
                sentiment_type = "positive"
            elif compound <= -0.05:
                sentiment_type = "negative"
            else:
                sentiment_type = "neutral"
            
            # Check for mixed sentiment
            if scores['pos'] > 0.2 and scores['neg'] > 0.2:
                sentiment_type = "mixed"
            
            # Calculate confidence based on how extreme the score is
            confidence = min(abs(compound) + 0.5, 1.0)
            
            return {
                "type": sentiment_type,
                "score": compound,
                "confidence": confidence,
                "scores": scores,
            }
        
        # Fallback to simple word matching
        return self._fallback_sentiment(text)
    
    def _fallback_sentiment(self, text: str) -> dict:
        """Simple fallback sentiment analysis."""
        positive_words = {'good', 'great', 'excellent', 'amazing', 'love', 'best', 'happy', 'wonderful'}
        negative_words = {'bad', 'terrible', 'awful', 'hate', 'worst', 'sad', 'angry', 'disappointed'}
        
        words = set(text.lower().split())
        pos_count = len(words & positive_words)
        neg_count = len(words & negative_words)
        
        if pos_count > neg_count:
            return {"type": "positive", "score": 0.5, "confidence": 0.3}
        elif neg_count > pos_count:
            return {"type": "negative", "score": -0.5, "confidence": 0.3}
        return {"type": "neutral", "score": 0.0, "confidence": 0.3}
    
    def _extract_entities(self, text: str) -> List[dict]:
        """
        Extract named entities using spaCy.
        """
        nlp = self.get_spacy()
        
        if nlp:
            doc = nlp(text[:10000])  # Limit text length
            entities = []
            
            # Map spaCy labels to our types
            label_map = {
                "PERSON": "person",
                "ORG": "organization",
                "GPE": "location",
                "LOC": "location",
                "PRODUCT": "product",
                "EVENT": "event",
                "WORK_OF_ART": "work",
                "LAW": "law",
                "LANGUAGE": "language",
                "DATE": "date",
                "TIME": "time",
                "MONEY": "money",
                "QUANTITY": "quantity",
                "PERCENT": "percent",
            }
            
            seen = set()
            for ent in doc.ents:
                if ent.text not in seen and len(ent.text) > 1:
                    seen.add(ent.text)
                    entities.append({
                        "name": ent.text,
                        "type": label_map.get(ent.label_, "other"),
                        "confidence": 0.85,  # spaCy doesn't provide confidence
                    })
            
            return entities[:20]  # Limit to 20 entities
        
        return []
    
    def _extract_keywords(self, text: str) -> List[str]:
        """
        Extract keywords from text.
        
        Uses TF-IDF-like approach with stopword removal.
        """
        # Common English stopwords
        stopwords = {
            'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
            'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'been',
            'be', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
            'could', 'should', 'may', 'might', 'must', 'can', 'this', 'that',
            'these', 'those', 'i', 'you', 'he', 'she', 'it', 'we', 'they',
            'what', 'which', 'who', 'when', 'where', 'why', 'how', 'all',
            'each', 'every', 'both', 'few', 'more', 'most', 'other', 'some',
            'such', 'no', 'not', 'only', 'same', 'so', 'than', 'too', 'very',
            'just', 'about', 'also', 'back', 'being', 'here', 'into', 'made',
            'many', 'much', 'new', 'now', 'over', 'our', 'out', 'own', 'said',
            'them', 'then', 'there', 'up', 'use', 'used', 'well', 'your',
        }
        
        # Tokenize and filter
        words = re.findall(r'\b[a-z]{3,}\b', text.lower())
        word_counts = {}
        
        for word in words:
            if word not in stopwords:
                word_counts[word] = word_counts.get(word, 0) + 1
        
        # Sort by frequency and return top keywords
        sorted_words = sorted(word_counts.items(), key=lambda x: x[1], reverse=True)
        return [word for word, count in sorted_words[:15]]
    
    def _detect_topics(self, text: str, keywords: List[str]) -> List[str]:
        """
        Detect topics from text using keyword matching.
        
        Simple rule-based approach; can be enhanced with ML models.
        """
        topics = []
        text_lower = text.lower()
        keywords_set = set(keywords)
        
        topic_keywords = {
            "Technology": ["tech", "software", "app", "digital", "computer", "ai", "data", "cloud", "cyber"],
            "Business": ["business", "company", "market", "finance", "investment", "startup", "revenue", "profit"],
            "Politics": ["politics", "government", "policy", "election", "vote", "president", "congress", "law"],
            "Health": ["health", "medical", "doctor", "hospital", "vaccine", "covid", "medicine", "treatment"],
            "Sports": ["sports", "game", "team", "player", "match", "win", "championship", "score"],
            "Entertainment": ["movie", "music", "celebrity", "film", "actor", "singer", "streaming", "show"],
            "Science": ["science", "research", "study", "discovery", "experiment", "scientist", "nasa", "space"],
            "Environment": ["climate", "environment", "green", "sustainable", "carbon", "pollution", "energy"],
            "Education": ["education", "school", "university", "student", "learning", "teacher", "college"],
            "Social": ["social", "community", "culture", "people", "society", "family", "relationship"],
        }
        
        for topic, topic_words in topic_keywords.items():
            if any(word in text_lower or word in keywords_set for word in topic_words):
                topics.append(topic)
        
        return topics[:5] if topics else ["General"]
    
    def _detect_language(self, text: str) -> dict:
        """
        Detect language of text.
        """
        langdetect = self.get_langdetect()
        
        if langdetect and len(text) > 10:
            try:
                lang_code = langdetect["detect"](text)
                
                # Get confidence
                try:
                    probs = langdetect["detect_langs"](text)
                    confidence = probs[0].prob if probs else 0.9
                except:
                    confidence = 0.9
                
                # Map language codes to names
                lang_names = {
                    "en": "English", "es": "Spanish", "fr": "French",
                    "de": "German", "it": "Italian", "pt": "Portuguese",
                    "nl": "Dutch", "ru": "Russian", "ja": "Japanese",
                    "zh-cn": "Chinese", "ko": "Korean", "ar": "Arabic",
                }
                
                return {
                    "code": lang_code,
                    "name": lang_names.get(lang_code, lang_code.upper()),
                    "confidence": confidence,
                }
            except Exception as e:
                pass
        
        # Default to English
        return {"code": "en", "name": "English", "confidence": 0.5}


# Singleton instance
_nlp_service = None

def get_nlp_service() -> NLPService:
    """Get singleton NLP service instance."""
    global _nlp_service
    if _nlp_service is None:
        _nlp_service = NLPService()
    return _nlp_service
