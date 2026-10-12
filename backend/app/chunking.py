"""Sentence-aware text chunking for long scripts."""

import re
from typing import List

_SENTENCE_SPLIT = re.compile(r"(?<=[.!?…。！？])\s+")
_WORD_SPLIT = re.compile(r"\s+")


def _split_sentences(text: str) -> List[str]:
    text = " ".join(text.split())
    if not text:
        return []
    parts = _SENTENCE_SPLIT.split(text)
    return [p.strip() for p in parts if p.strip()]


def _hard_split(text: str, max_chars: int) -> List[str]:
    words = _WORD_SPLIT.split(text)
    chunks: List[str] = []
    buf: List[str] = []
    size = 0
    for w in words:
        add = len(w) + (1 if buf else 0)
        if buf and size + add > max_chars:
            chunks.append(" ".join(buf))
            buf = [w]
            size = len(w)
        else:
            buf.append(w)
            size += add
    if buf:
        chunks.append(" ".join(buf))
    return chunks


def split_text(text: str, max_chars: int = 420) -> List[str]:
    """Split text into chunks of at most ~max_chars, preferring sentence
    boundaries. Very long sentences are hard-split on word boundaries."""
    max_chars = max(80, int(max_chars))
    sentences = _split_sentences(text)
    if not sentences:
        return []

    chunks: List[str] = []
    buf = ""
    for sent in sentences:
        if len(sent) > max_chars:
            if buf:
                chunks.append(buf)
                buf = ""
            chunks.extend(_hard_split(sent, max_chars))
            continue
        candidate = f"{buf} {sent}".strip() if buf else sent
        if len(candidate) <= max_chars:
            buf = candidate
        else:
            if buf:
                chunks.append(buf)
            buf = sent
    if buf:
        chunks.append(buf)
    return chunks
