import os
import re
import sqlite3


def enabled() -> bool:
    return os.environ.get("KB_VECTOR_BACKEND", "pinecone").strip().lower() == "local"


def _db_path() -> str:
    return os.environ.get("LOCAL_KB_DB_PATH", "/tmp/quickvoice-kb.sqlite3")


def _connect() -> sqlite3.Connection:
    path = _db_path()
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    connection = sqlite3.connect(path)
    connection.execute(
        """
        CREATE TABLE IF NOT EXISTS kb_chunks (
            agent_id TEXT NOT NULL,
            kb_id TEXT NOT NULL,
            chunk_idx INTEGER NOT NULL,
            name TEXT NOT NULL,
            text TEXT NOT NULL,
            PRIMARY KEY (agent_id, kb_id, chunk_idx)
        )
        """
    )
    return connection


def replace_chunks(*, agent_id: str, kb_id: str, name: str, chunks: list[str]) -> None:
    with _connect() as connection:
        connection.execute(
            "DELETE FROM kb_chunks WHERE agent_id = ? AND kb_id = ?",
            (agent_id, kb_id),
        )
        connection.executemany(
            "INSERT INTO kb_chunks (agent_id, kb_id, chunk_idx, name, text) VALUES (?, ?, ?, ?, ?)",
            [(agent_id, kb_id, index, name, chunk) for index, chunk in enumerate(chunks)],
        )


def delete_chunks(*, agent_id: str, kb_id: str) -> None:
    with _connect() as connection:
        connection.execute(
            "DELETE FROM kb_chunks WHERE agent_id = ? AND kb_id = ?",
            (agent_id, kb_id),
        )


def search_chunks(*, agent_id: str, query: str, top_k: int) -> list[dict]:
    tokens = {token for token in re.findall(r"[\wáéíóúñü]+", query.lower()) if len(token) >= 3}
    if not tokens:
        return []

    with _connect() as connection:
        rows = connection.execute(
            "SELECT kb_id, chunk_idx, name, text FROM kb_chunks WHERE agent_id = ?",
            (agent_id,),
        ).fetchall()

    matches = []
    for kb_id, chunk_idx, name, text in rows:
        lowered = text.lower()
        score = sum(lowered.count(token) for token in tokens)
        if score:
            matches.append(
                {
                    "id": f"{kb_id}#{chunk_idx}",
                    "score": float(score),
                    "metadata": {
                        "agentId": agent_id,
                        "kbId": kb_id,
                        "chunkIdx": chunk_idx,
                        "name": name,
                        "text": text,
                    },
                }
            )
    matches.sort(key=lambda item: item["score"], reverse=True)
    return matches[:top_k]
