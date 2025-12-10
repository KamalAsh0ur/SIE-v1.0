"""
Image Preprocessing for OCR

Preprocessing pipeline to improve OCR accuracy.
Implements SRS §3.2 requirements for image quality enhancement.
"""

from typing import Optional, Tuple
from io import BytesIO
import math


class ImagePreprocessor:
    """
    Image preprocessing pipeline for OCR optimization.
    
    Features:
    - Resize to optimal dimensions
    - Denoise (Gaussian blur)
    - Contrast enhancement (CLAHE)
    - Binarization (adaptive thresholding)
    - Deskewing
    - Border removal
    """
    
    def __init__(
        self,
        target_dpi: int = 300,
        max_dimension: int = 4096,
        min_dimension: int = 50,
    ):
        """
        Initialize preprocessor.
        
        Args:
            target_dpi: Target DPI for OCR (300 recommended)
            max_dimension: Maximum image dimension
            min_dimension: Minimum image dimension
        """
        self.target_dpi = target_dpi
        self.max_dimension = max_dimension
        self.min_dimension = min_dimension
        self._cv2 = None
        self._np = None
        self._pil = None
    
    def _ensure_deps(self):
        """Lazy load dependencies."""
        if self._cv2 is None:
            try:
                import cv2
                import numpy as np
                from PIL import Image
                self._cv2 = cv2
                self._np = np
                self._pil = Image
            except ImportError as e:
                raise ImportError(
                    "Image preprocessing requires: pip install opencv-python numpy Pillow"
                ) from e
    
    def preprocess(
        self,
        image_bytes: bytes,
        denoise: bool = True,
        enhance_contrast: bool = True,
        binarize: bool = False,
        deskew: bool = True,
        remove_borders: bool = False,
    ) -> Tuple[bytes, dict]:
        """
        Apply preprocessing pipeline to image.
        
        Args:
            image_bytes: Raw image bytes
            denoise: Apply denoising
            enhance_contrast: Apply contrast enhancement
            binarize: Convert to binary (black/white)
            deskew: Correct skew angle
            remove_borders: Remove black borders
            
        Returns:
            Tuple of (processed_image_bytes, metadata)
        """
        self._ensure_deps()
        cv2 = self._cv2
        np = self._np
        
        # Decode image
        nparr = np.frombuffer(image_bytes, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        
        if img is None:
            raise ValueError("Failed to decode image")
        
        original_shape = img.shape[:2]
        metadata = {
            "original_width": original_shape[1],
            "original_height": original_shape[0],
            "steps_applied": [],
        }
        
        # Step 1: Resize if needed
        img = self._resize_for_ocr(img)
        if img.shape[:2] != original_shape:
            metadata["steps_applied"].append("resize")
            metadata["new_width"] = img.shape[1]
            metadata["new_height"] = img.shape[0]
        
        # Step 2: Convert to grayscale
        if len(img.shape) == 3:
            gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
            metadata["steps_applied"].append("grayscale")
        else:
            gray = img
        
        # Step 3: Denoise
        if denoise:
            gray = self._denoise(gray)
            metadata["steps_applied"].append("denoise")
        
        # Step 4: Deskew
        if deskew:
            gray, angle = self._deskew(gray)
            if abs(angle) > 0.5:
                metadata["steps_applied"].append("deskew")
                metadata["skew_angle"] = round(angle, 2)
        
        # Step 5: Remove borders
        if remove_borders:
            gray = self._remove_borders(gray)
            metadata["steps_applied"].append("remove_borders")
        
        # Step 6: Enhance contrast
        if enhance_contrast:
            gray = self._enhance_contrast(gray)
            metadata["steps_applied"].append("contrast_enhancement")
        
        # Step 7: Binarize (optional)
        if binarize:
            gray = self._binarize(gray)
            metadata["steps_applied"].append("binarize")
        
        # Encode back to bytes
        success, encoded = cv2.imencode('.png', gray)
        if not success:
            raise ValueError("Failed to encode processed image")
        
        metadata["final_width"] = gray.shape[1]
        metadata["final_height"] = gray.shape[0]
        
        return encoded.tobytes(), metadata
    
    def _resize_for_ocr(self, img):
        """Resize image to optimal dimensions for OCR."""
        cv2 = self._cv2
        
        h, w = img.shape[:2]
        
        # Don't process tiny images
        if w < self.min_dimension or h < self.min_dimension:
            return img
        
        # Scale down if too large
        if max(w, h) > self.max_dimension:
            scale = self.max_dimension / max(w, h)
            new_w = int(w * scale)
            new_h = int(h * scale)
            img = cv2.resize(img, (new_w, new_h), interpolation=cv2.INTER_AREA)
        
        # Scale up if too small (OCR works better on larger images)
        elif max(w, h) < 1000:
            scale = min(2.0, 1000 / max(w, h))
            new_w = int(w * scale)
            new_h = int(h * scale)
            img = cv2.resize(img, (new_w, new_h), interpolation=cv2.INTER_CUBIC)
        
        return img
    
    def _denoise(self, gray):
        """Apply denoising to grayscale image."""
        cv2 = self._cv2
        
        # Non-local means denoising (slower but better quality)
        # For faster processing, use GaussianBlur
        try:
            denoised = cv2.fastNlMeansDenoising(gray, None, h=10, templateWindowSize=7, searchWindowSize=21)
        except cv2.error:
            # Fallback to Gaussian blur
            denoised = cv2.GaussianBlur(gray, (3, 3), 0)
        
        return denoised
    
    def _enhance_contrast(self, gray):
        """Enhance contrast using CLAHE (Contrast Limited Adaptive Histogram Equalization)."""
        cv2 = self._cv2
        
        # CLAHE with clip limit to prevent over-amplification
        clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
        enhanced = clahe.apply(gray)
        
        return enhanced
    
    def _binarize(self, gray):
        """Convert to binary using adaptive thresholding."""
        cv2 = self._cv2
        
        # Adaptive thresholding works better for varying lighting
        binary = cv2.adaptiveThreshold(
            gray,
            255,
            cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
            cv2.THRESH_BINARY,
            blockSize=11,
            C=2,
        )
        
        return binary
    
    def _deskew(self, gray) -> Tuple[any, float]:
        """Detect and correct skew angle."""
        cv2 = self._cv2
        np = self._np
        
        # Detect edges
        edges = cv2.Canny(gray, 50, 150, apertureSize=3)
        
        # Detect lines using Hough transform
        lines = cv2.HoughLinesP(
            edges,
            rho=1,
            theta=np.pi / 180,
            threshold=100,
            minLineLength=100,
            maxLineGap=10,
        )
        
        if lines is None:
            return gray, 0.0
        
        # Calculate angles of detected lines
        angles = []
        for line in lines:
            x1, y1, x2, y2 = line[0]
            if x2 - x1 != 0:
                angle = math.atan2(y2 - y1, x2 - x1) * 180 / math.pi
                # Only consider near-horizontal lines
                if abs(angle) < 45:
                    angles.append(angle)
        
        if not angles:
            return gray, 0.0
        
        # Median angle
        median_angle = np.median(angles)
        
        # Only correct if angle is significant
        if abs(median_angle) < 0.5:
            return gray, 0.0
        
        # Rotate image
        h, w = gray.shape
        center = (w // 2, h // 2)
        rotation_matrix = cv2.getRotationMatrix2D(center, median_angle, 1.0)
        rotated = cv2.warpAffine(
            gray,
            rotation_matrix,
            (w, h),
            flags=cv2.INTER_CUBIC,
            borderMode=cv2.BORDER_REPLICATE,
        )
        
        return rotated, median_angle
    
    def _remove_borders(self, gray):
        """Remove black borders from image."""
        cv2 = self._cv2
        np = self._np
        
        # Find non-black pixels
        _, thresh = cv2.threshold(gray, 10, 255, cv2.THRESH_BINARY)
        
        # Find contours
        contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        
        if not contours:
            return gray
        
        # Get bounding box of largest contour
        largest = max(contours, key=cv2.contourArea)
        x, y, w, h = cv2.boundingRect(largest)
        
        # Add small margin
        margin = 5
        x = max(0, x - margin)
        y = max(0, y - margin)
        w = min(gray.shape[1] - x, w + 2 * margin)
        h = min(gray.shape[0] - y, h + 2 * margin)
        
        return gray[y:y+h, x:x+w]
    
    def preprocess_url(self, url: str, **kwargs) -> Tuple[bytes, dict]:
        """
        Download and preprocess image from URL.
        
        Args:
            url: Image URL
            **kwargs: Arguments passed to preprocess()
            
        Returns:
            Tuple of (processed_image_bytes, metadata)
        """
        import httpx
        
        response = httpx.get(url, timeout=30.0, follow_redirects=True)
        response.raise_for_status()
        
        return self.preprocess(response.content, **kwargs)


# ============================================================================
# Quick Preprocessing Functions
# ============================================================================

def preprocess_for_ocr(
    image_bytes: bytes,
    quality: str = "balanced",
) -> Tuple[bytes, dict]:
    """
    Preprocess image for OCR with preset quality levels.
    
    Args:
        image_bytes: Raw image bytes
        quality: 'fast', 'balanced', or 'best'
        
    Returns:
        Tuple of (processed_image_bytes, metadata)
    """
    preprocessor = ImagePreprocessor()
    
    if quality == "fast":
        return preprocessor.preprocess(
            image_bytes,
            denoise=False,
            enhance_contrast=True,
            binarize=False,
            deskew=False,
            remove_borders=False,
        )
    elif quality == "best":
        return preprocessor.preprocess(
            image_bytes,
            denoise=True,
            enhance_contrast=True,
            binarize=True,
            deskew=True,
            remove_borders=True,
        )
    else:  # balanced
        return preprocessor.preprocess(
            image_bytes,
            denoise=True,
            enhance_contrast=True,
            binarize=False,
            deskew=True,
            remove_borders=False,
        )


# Singleton
_preprocessor = None

def get_preprocessor() -> ImagePreprocessor:
    """Get singleton preprocessor."""
    global _preprocessor
    if _preprocessor is None:
        _preprocessor = ImagePreprocessor()
    return _preprocessor
