import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import re
import asyncio
from typing import List, Dict, Any
from dotenv import load_dotenv

# Load env variables
load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), "..", ".env"))

from motor.motor_asyncio import AsyncIOMotorClient
from sentence_transformers import SentenceTransformer

# Embedding Model Initialization (Local - zero API cost)
MODEL_NAME = "all-MiniLM-L6-v2"
print(f"Loading local embedding model ({MODEL_NAME})...")
embedder = SentenceTransformer(MODEL_NAME)


def parse_metadata_and_body(file_content: str) -> tuple[Dict[str, str], str]:
    """Parses source document headers (Source, Topic, URL) from top of file."""
    metadata = {
        "sourceDocument": "Medical Reference",
        "sourceUrl": "",
        "topic": "General Health"
    }
    
    lines = file_content.splitlines()
    body_lines = []
    
    for line in lines:
        if line.startswith("Source:"):
            metadata["sourceDocument"] = line.replace("Source:", "").strip()
        elif line.startswith("Topic:"):
            metadata["topic"] = line.replace("Topic:", "").strip()
        elif line.startswith("URL:"):
            metadata["sourceUrl"] = line.replace("URL:", "").strip()
        elif line.startswith("# "):
            if metadata["sourceDocument"] == "Medical Reference":
                metadata["sourceDocument"] = line.replace("# ", "").strip()
        else:
            body_lines.append(line)
            
    return metadata, "\n".join(body_lines)


def chunk_text(text: str, target_words: int = 350, overlap_words: int = 50) -> List[str]:
    """
    Chunks text into ~300-500 word segments with ~50 word overlap based on section boundaries.
    """
    sections = re.split(r'\n(?=##\s+)', text)
    chunks = []

    for section in sections:
        section = section.strip()
        if not section:
            continue
            
        words = section.split()
        if len(words) <= target_words + overlap_words:
            chunks.append(section)
        else:
            # Segment large sections
            start = 0
            while start < len(words):
                end = start + target_words
                chunk_words = words[start:end]
                chunks.append(" ".join(chunk_words))
                if end >= len(words):
                    break
                start = end - overlap_words

    return chunks


from app.core.config import settings


async def ingest_documents():
    kb_dir = os.path.join(os.path.dirname(__file__), "..", "knowledge_base")
    if not os.path.exists(kb_dir):
        print(f"Knowledge base directory not found at: {kb_dir}")
        return

    mongo_uri = settings.MONGODB_URI
    db_name = settings.MONGO_DB_NAME
    
    client = AsyncIOMotorClient(mongo_uri)
    db = client[db_name]
    collection = db["medicalKnowledge"]

    # Idempotent behavior: clear existing knowledge collection before ingesting
    deleted = await collection.delete_many({})
    print(f"Idempotency check: Cleared {deleted.deleted_count} old entries from 'medicalKnowledge' collection.")

    documents_to_insert = []
    
    for filename in os.listdir(kb_dir):
        if filename.endswith(".md") or filename.endswith(".txt"):
            file_path = os.path.join(kb_dir, filename)
            with open(file_path, "r", encoding="utf-8") as f:
                content = f.read()

            metadata, body = parse_metadata_and_body(content)
            chunks = chunk_text(body)

            print(f"\nProcessing '{filename}' -> {len(chunks)} chunks...")

            for idx, chunk in enumerate(chunks):
                # Generate 384-dimensional embedding vector locally
                embedding_vector = embedder.encode(chunk).tolist()

                doc = {
                    "chunkText": chunk,
                    "embedding": embedding_vector,
                    "sourceDocument": metadata["sourceDocument"],
                    "sourceUrl": metadata["sourceUrl"],
                    "topic": metadata["topic"],
                    "chunkIndex": idx,
                    "filename": filename
                }
                documents_to_insert.append(doc)

    if documents_to_insert:
        result = await collection.insert_many(documents_to_insert)
        print(f"\nSUCCESS: Ingested {len(result.inserted_ids)} chunks into 'medicalKnowledge' collection!")
    else:
        print("No documents found to ingest.")

    client.close()

if __name__ == "__main__":
    asyncio.run(ingest_documents())
