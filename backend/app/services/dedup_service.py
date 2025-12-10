"""
Deduplication Service

Advanced deduplication using hash-based and similarity-based methods.
Implements SRS §3.3 requirements.
"""

from typing import List, Dict, Any, Tuple, Optional
import hashlib
import re


class DeduplicationService:
    """
    Content deduplication service.
    
    Features:
    - Exact duplicate detection (MD5 hash)
    - Near-duplicate detection (SimHash)
    - Configurable similarity threshold
    """
    
    def __init__(self, similarity_threshold: float = 0.9):
        """
        Initialize deduplication service.
        
        Args:
            similarity_threshold: SimHash similarity threshold (0.0-1.0)
        """
        self.similarity_threshold = similarity_threshold
        self._seen_hashes: Dict[str, str] = {}  # hash -> original_id
        self._seen_simhashes: Dict[int, str] = {}  # simhash -> original_id
    
    def reset(self):
        """Reset seen hashes (for new batch)."""
        self._seen_hashes.clear()
        self._seen_simhashes.clear()
    
    def check_duplicate(
        self,
        content: str,
        item_id: str,
    ) -> Tuple[bool, bool, Optional[str]]:
        """
        Check if content is a duplicate.
        
        Args:
            content: Text content to check
            item_id: ID of the item
            
        Returns:
            Tuple of (is_exact_duplicate, is_near_duplicate, original_id)
        """
        if not content:
            return False, False, None
        
        # Clean content for comparison
        clean_content = self._clean_text(content)
        
        # Check exact duplicate
        content_hash = self._compute_hash(clean_content)
        if content_hash in self._seen_hashes:
            return True, False, self._seen_hashes[content_hash]
        
        # Check near duplicate using SimHash
        simhash = self._compute_simhash(clean_content)
        for seen_hash, original_id in self._seen_simhashes.items():
            similarity = self._simhash_similarity(simhash, seen_hash)
            if similarity >= self.similarity_threshold:
                return False, True, original_id
        
        # Not a duplicate - add to seen
        self._seen_hashes[content_hash] = item_id
        self._seen_simhashes[simhash] = item_id
        
        return False, False, None
    
    def deduplicate_batch(
        self,
        items: List[Dict[str, Any]],
        content_field: str = "content",
        id_field: str = "id",
    ) -> List[Dict[str, Any]]:
        """
        Deduplicate a batch of items.
        
        Args:
            items: List of items to deduplicate
            content_field: Field containing content
            id_field: Field containing item ID
            
        Returns:
            Items with duplicate flags added
        """
        self.reset()
        
        for item in items:
            content = item.get(content_field, "")
            item_id = item.get(id_field, str(id(item)))
            
            is_exact, is_near, original_id = self.check_duplicate(content, item_id)
            
            item["is_duplicate"] = is_exact or is_near
            item["is_exact_duplicate"] = is_exact
            item["is_near_duplicate"] = is_near
            item["duplicate_of"] = original_id
        
        return items
    
    def _clean_text(self, text: str) -> str:
        """Clean text for comparison."""
        # Lowercase
        text = text.lower()
        # Remove URLs
        text = re.sub(r'https?://\S+', '', text)
        # Remove extra whitespace
        text = re.sub(r'\s+', ' ', text)
        # Remove punctuation
        text = re.sub(r'[^\w\s]', '', text)
        return text.strip()
    
    def _compute_hash(self, text: str) -> str:
        """Compute MD5 hash of text."""
        return hashlib.md5(text.encode('utf-8')).hexdigest()
    
    def _compute_simhash(self, text: str, hash_bits: int = 64) -> int:
        """
        Compute SimHash of text.
        
        SimHash is a locality-sensitive hash that produces similar
        hashes for similar text.
        """
        # Tokenize
        tokens = text.split()
        if not tokens:
            return 0
        
        # Initialize bit counts
        bit_counts = [0] * hash_bits
        
        # Hash each token and update bit counts
        for token in tokens:
            token_hash = int(hashlib.md5(token.encode('utf-8')).hexdigest(), 16)
            for i in range(hash_bits):
                bit = (token_hash >> i) & 1
                if bit:
                    bit_counts[i] += 1
                else:
                    bit_counts[i] -= 1
        
        # Compute final hash
        simhash = 0
        for i in range(hash_bits):
            if bit_counts[i] > 0:
                simhash |= (1 << i)
        
        return simhash
    
    def _simhash_similarity(self, hash1: int, hash2: int, hash_bits: int = 64) -> float:
        """
        Compute similarity between two SimHashes.
        
        Returns value between 0.0 (completely different) and 1.0 (identical).
        """
        # Count differing bits (Hamming distance)
        xor = hash1 ^ hash2
        differing_bits = bin(xor).count('1')
        
        # Convert to similarity
        similarity = 1.0 - (differing_bits / hash_bits)
        return similarity


class MinHashService:
    """
    MinHash-based near-duplicate detection.
    
    Uses multiple hash functions to estimate Jaccard similarity.
    """
    
    def __init__(self, num_hashes: int = 128, shingle_size: int = 3):
        """
        Initialize MinHash service.
        
        Args:
            num_hashes: Number of hash functions
            shingle_size: Size of shingles (character n-grams)
        """
        self.num_hashes = num_hashes
        self.shingle_size = shingle_size
        self._signatures: Dict[str, List[int]] = {}
    
    def compute_signature(self, text: str) -> List[int]:
        """
        Compute MinHash signature for text.
        
        Args:
            text: Text to compute signature for
            
        Returns:
            List of minimum hash values
        """
        # Generate shingles
        shingles = self._generate_shingles(text)
        
        if not shingles:
            return [0] * self.num_hashes
        
        # Compute minimum hash for each hash function
        signature = []
        for i in range(self.num_hashes):
            min_hash = float('inf')
            for shingle in shingles:
                # Use different hash seeds for each function
                h = int(hashlib.md5(f"{i}:{shingle}".encode()).hexdigest(), 16)
                min_hash = min(min_hash, h)
            signature.append(min_hash)
        
        return signature
    
    def estimate_similarity(self, sig1: List[int], sig2: List[int]) -> float:
        """
        Estimate Jaccard similarity from MinHash signatures.
        
        Args:
            sig1: First signature
            sig2: Second signature
            
        Returns:
            Estimated similarity (0.0-1.0)
        """
        if len(sig1) != len(sig2):
            return 0.0
        
        matches = sum(1 for a, b in zip(sig1, sig2) if a == b)
        return matches / len(sig1)
    
    def _generate_shingles(self, text: str) -> set:
        """Generate character n-grams (shingles)."""
        text = text.lower().strip()
        if len(text) < self.shingle_size:
            return {text}
        
        shingles = set()
        for i in range(len(text) - self.shingle_size + 1):
            shingles.add(text[i:i + self.shingle_size])
        
        return shingles
    
    def add_document(self, doc_id: str, text: str):
        """Add document to signature store."""
        self._signatures[doc_id] = self.compute_signature(text)
    
    def find_similar(
        self,
        text: str,
        threshold: float = 0.9,
    ) -> List[Tuple[str, float]]:
        """
        Find documents similar to the given text.
        
        Args:
            text: Text to search for
            threshold: Minimum similarity threshold
            
        Returns:
            List of (doc_id, similarity) tuples
        """
        signature = self.compute_signature(text)
        similar = []
        
        for doc_id, stored_sig in self._signatures.items():
            similarity = self.estimate_similarity(signature, stored_sig)
            if similarity >= threshold:
                similar.append((doc_id, similarity))
        
        # Sort by similarity descending
        similar.sort(key=lambda x: x[1], reverse=True)
        return similar


# Singleton instances
_dedup_service = None
_minhash_service = None


def get_dedup_service(threshold: float = 0.9) -> DeduplicationService:
    """Get singleton deduplication service."""
    global _dedup_service
    if _dedup_service is None:
        _dedup_service = DeduplicationService(threshold)
    return _dedup_service


def get_minhash_service() -> MinHashService:
    """Get singleton MinHash service."""
    global _minhash_service
    if _minhash_service is None:
        _minhash_service = MinHashService()
    return _minhash_service
