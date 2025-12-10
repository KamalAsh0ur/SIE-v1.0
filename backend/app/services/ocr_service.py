"""
OCR Service

Performs optical character recognition on images to extract text.
Uses EasyOCR as primary engine with Tesseract fallback.
Includes image preprocessing for improved accuracy.

Implements SRS §5.3 requirements.
"""

from typing import List, Optional
import io
import os
import tempfile


class OCRService:
    """
    OCR processing service using EasyOCR.
    
    Lazy-loads EasyOCR reader to reduce startup time.
    Includes image preprocessing for improved accuracy.
    """
    
    _reader = None
    
    def __init__(
        self,
        languages: List[str] = None,
        gpu: bool = False,
        preprocess: bool = True,
        preprocess_quality: str = "balanced",
    ):
        """
        Initialize OCR service.
        
        Args:
            languages: List of language codes to support (default: ['en'])
            gpu: Whether to use GPU acceleration
            preprocess: Enable image preprocessing
            preprocess_quality: 'fast', 'balanced', or 'best'
        """
        self.languages = languages or ['en']
        self.gpu = gpu
        self.preprocess = preprocess
        self.preprocess_quality = preprocess_quality
        self._preprocessor = None
    
    @property
    def preprocessor(self):
        """Lazy-load image preprocessor."""
        if self._preprocessor is None and self.preprocess:
            try:
                from app.services.image_preprocessing import ImagePreprocessor
                self._preprocessor = ImagePreprocessor()
                print("✓ Image preprocessor loaded")
            except ImportError as e:
                print(f"⚠ Preprocessing not available: {e}")
                self._preprocessor = False
        return self._preprocessor if self._preprocessor else None
    
    @classmethod
    def get_reader(cls, languages: List[str] = None, gpu: bool = False):
        """Lazy-load EasyOCR reader."""
        if cls._reader is None:
            try:
                import easyocr
                cls._reader = easyocr.Reader(
                    languages or ['en'],
                    gpu=gpu,
                    verbose=False,
                )
                print("✓ EasyOCR reader loaded")
            except Exception as e:
                print(f"⚠ Could not load EasyOCR: {e}")
                cls._reader = False
        return cls._reader if cls._reader else None
    
    def extract_text(self, image_sources: List[str]) -> dict:
        """
        Extract text from images.
        
        Args:
            image_sources: List of image URLs or file paths
            
        Returns:
            dict with extracted text, confidence, and regions
        """
        if not image_sources:
            return {"text": "", "confidence": 0.0, "regions": []}
        
        all_text = []
        all_regions = []
        total_confidence = 0
        num_results = 0
        
        for source in image_sources[:5]:  # Limit to 5 images
            try:
                result = self._extract_from_source(source)
                
                if result["text"]:
                    all_text.append(result["text"])
                    all_regions.extend(result["regions"])
                    total_confidence += result["confidence"]
                    num_results += 1
                    
            except Exception as e:
                print(f"⚠ OCR failed for {source}: {e}")
                continue
        
        return {
            "text": " ".join(all_text),
            "confidence": total_confidence / num_results if num_results > 0 else 0.0,
            "regions": all_regions,
        }
    
    def _extract_from_source(self, source: str) -> dict:
        """
        Extract text from a single image source.
        
        Args:
            source: Image URL or file path
            
        Returns:
            dict with text, confidence, and regions
        """
        reader = self.get_reader(self.languages, self.gpu)
        
        if not reader:
            return self._fallback_ocr(source)
        
        try:
            # Handle URL vs file path
            if source.startswith(('http://', 'https://')):
                image_data = self._download_image(source)
            else:
                with open(source, 'rb') as f:
                    image_data = f.read()
            
            # Apply preprocessing if available
            preprocessing_metadata = None
            if self.preprocessor:
                try:
                    image_data, preprocessing_metadata = self._preprocess_image(image_data)
                except Exception as e:
                    print(f"⚠ Preprocessing failed, using original image: {e}")
            
            # Run OCR
            results = reader.readtext(image_data)
            
            # Process results
            texts = []
            regions = []
            confidences = []
            
            for (bbox, text, confidence) in results:
                if confidence > 0.3:  # Filter low confidence
                    texts.append(text)
                    confidences.append(confidence)
                    regions.append({
                        "text": text,
                        "confidence": confidence,
                        "bbox": bbox,
                    })
            
            avg_confidence = sum(confidences) / len(confidences) if confidences else 0.0
            
            return {
                "text": " ".join(texts),
                "confidence": avg_confidence,
                "regions": regions,
            }
            
        except Exception as e:
            print(f"⚠ EasyOCR error: {e}")
            return self._fallback_ocr(source)
    
    def _download_image(self, url: str) -> bytes:
        """
        Download image from URL.
        
        Args:
            url: Image URL
            
        Returns:
            Image bytes
        """
        import httpx
        
        response = httpx.get(url, timeout=30.0, follow_redirects=True)
        response.raise_for_status()
        return response.content
    
    def _preprocess_image(self, image_bytes: bytes) -> tuple:
        """
        Apply preprocessing to image for better OCR accuracy.
        
        Args:
            image_bytes: Raw image bytes
            
        Returns:
            Tuple of (processed_bytes, metadata)
        """
        if not self.preprocessor:
            return image_bytes, None
        
        # Preprocessing settings based on quality level
        settings = {
            "fast": {
                "denoise": False,
                "enhance_contrast": True,
                "binarize": False,
                "deskew": False,
                "remove_borders": False,
            },
            "balanced": {
                "denoise": True,
                "enhance_contrast": True,
                "binarize": False,
                "deskew": True,
                "remove_borders": False,
            },
            "best": {
                "denoise": True,
                "enhance_contrast": True,
                "binarize": True,
                "deskew": True,
                "remove_borders": True,
            },
        }
        
        opts = settings.get(self.preprocess_quality, settings["balanced"])
        
        processed_bytes, metadata = self.preprocessor.preprocess(
            image_bytes,
            **opts
        )
        
        return processed_bytes, metadata
    
    def _fallback_ocr(self, source: str) -> dict:
        """
        Fallback OCR using Tesseract.
        
        Args:
            source: Image source
            
        Returns:
            dict with text, confidence, and regions
        """
        try:
            import pytesseract
            from PIL import Image
            
            # Load image
            if source.startswith(('http://', 'https://')):
                image_data = self._download_image(source)
                image = Image.open(io.BytesIO(image_data))
            else:
                image = Image.open(source)
            
            # Run Tesseract
            text = pytesseract.image_to_string(image)
            
            return {
                "text": text.strip(),
                "confidence": 0.7,  # Tesseract doesn't provide confidence easily
                "regions": [{"text": text.strip(), "confidence": 0.7}] if text.strip() else [],
            }
            
        except Exception as e:
            print(f"⚠ Tesseract fallback failed: {e}")
            return {"text": "", "confidence": 0.0, "regions": []}
    
    def extract_text_from_bytes(self, image_bytes: bytes) -> dict:
        """
        Extract text from image bytes.
        
        Args:
            image_bytes: Raw image data
            
        Returns:
            dict with text, confidence, and regions
        """
        reader = self.get_reader(self.languages, self.gpu)
        
        if not reader:
            return {"text": "", "confidence": 0.0, "regions": []}
        
        try:
            results = reader.readtext(image_bytes)
            
            texts = []
            regions = []
            confidences = []
            
            for (bbox, text, confidence) in results:
                if confidence > 0.3:
                    texts.append(text)
                    confidences.append(confidence)
                    regions.append({
                        "text": text,
                        "confidence": confidence,
                    })
            
            return {
                "text": " ".join(texts),
                "confidence": sum(confidences) / len(confidences) if confidences else 0.0,
                "regions": regions,
            }
            
        except Exception as e:
            print(f"⚠ OCR from bytes failed: {e}")
            return {"text": "", "confidence": 0.0, "regions": []}


# Singleton instance
_ocr_service = None

def get_ocr_service(languages: List[str] = None, gpu: bool = False) -> OCRService:
    """Get singleton OCR service instance."""
    global _ocr_service
    if _ocr_service is None:
        _ocr_service = OCRService(languages, gpu)
    return _ocr_service
