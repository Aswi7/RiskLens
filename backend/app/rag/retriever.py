import logging
import numpy as np
from typing import List, Dict, Any, Optional
from sentence_transformers import SentenceTransformer
from app.db.mongodb import get_database

logger = logging.getLogger("risklens.rag")

# Model loaded once globally on server startup
MODEL_NAME = "all-MiniLM-L6-v2"
_embedder: Optional[SentenceTransformer] = None


def get_embedder() -> SentenceTransformer:
    global _embedder
    if _embedder is None:
        logger.info(f"Loading RAG embedding model ({MODEL_NAME})...")
        _embedder = SentenceTransformer(MODEL_NAME)
    return _embedder


def cosine_similarity(v1: List[float], v2: List[float]) -> float:
    """Calculates cosine similarity score between two vector embeddings."""
    arr1 = np.array(v1, dtype=np.float32)
    arr2 = np.array(v2, dtype=np.float32)
    norm1 = np.linalg.norm(arr1)
    norm2 = np.linalg.norm(arr2)
    if norm1 == 0 or norm2 == 0:
        return 0.0
    return float(np.dot(arr1, arr2) / (norm1 * norm2))


async def retrieve_medical_knowledge(
    user_message: str,
    top_k: int = 4,
    similarity_threshold: float = 0.42
) -> List[Dict[str, Any]]:
    """
    Embeds user message and retrieves top-k relevant medical knowledge chunks.
    Filters out chunks below the similarity threshold to avoid injecting irrelevant content.
    Supports MongoDB Atlas $vectorSearch with local in-memory cosine fallback for local MongoDB.
    """
    if not user_message or not user_message.strip():
        return []

    embedder = get_embedder()
    query_vector = embedder.encode(user_message).tolist()

    db = get_database()
    collection = db["medicalKnowledge"]

    results = []

    # 1. Try MongoDB Atlas $vectorSearch pipeline first
    try:
        pipeline = [
            {
                "$vectorSearch": {
                    "index": "vector_index",
                    "path": "embedding",
                    "queryVector": query_vector,
                    "numCandidates": 30,
                    "limit": top_k
                }
            },
            {
                "$project": {
                    "chunkText": 1,
                    "sourceDocument": 1,
                    "sourceUrl": 1,
                    "topic": 1,
                    "score": {"$meta": "vectorSearchScore"}
                }
            }
        ]
        cursor = collection.aggregate(pipeline)
        async for doc in cursor:
            score = doc.get("score", 0.0)
            if score >= similarity_threshold:
                results.append({
                    "chunkText": doc.get("chunkText", ""),
                    "sourceDocument": doc.get("sourceDocument", "Medical Reference"),
                    "sourceUrl": doc.get("sourceUrl", ""),
                    "topic": doc.get("topic", ""),
                    "score": score
                })
    except Exception as e:
        logger.debug(f"Atlas $vectorSearch not active on current DB instance ({e}). Falling back to local vector search.")

    # 2. Local Cosine Similarity Fallback (if Atlas Search Index is not active locally)
    if not results:
        cursor = collection.find({}, {"embedding": 1, "chunkText": 1, "sourceDocument": 1, "sourceUrl": 1, "topic": 1})
        scored_docs = []
        async for doc in cursor:
            emb = doc.get("embedding")
            if emb:
                sim = cosine_similarity(query_vector, emb)
                if sim >= similarity_threshold:
                    scored_docs.append((sim, doc))

        scored_docs.sort(key=lambda x: x[0], reverse=True)

        for sim, doc in scored_docs[:top_k]:
            results.append({
                "chunkText": doc.get("chunkText", ""),
                "sourceDocument": doc.get("sourceDocument", "Medical Reference"),
                "sourceUrl": doc.get("sourceUrl", ""),
                "topic": doc.get("topic", ""),
                "score": sim
            })

    return results
