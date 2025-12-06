CREATE EXTENSION IF NOT EXISTS "vector";

CREATE TABLE IF NOT EXISTS scrapped_images (
    id SERIAL PRIMARY KEY,
    img_name TEXT NOT NULL,
    img_hash TEXT NOT NULL UNIQUE,
    img_path TEXT NOT NULL,
    is_highlighted BOOLEAN NOT NULL DEFAULT FALSE,
    embedding_resnet VECTOR(512),
    embedding_clip VECTOR(512)
);

CREATE INDEX IF NOT EXISTS scrapped_images_embedding_resnet_idx ON scrapped_images USING hnsw (embedding_resnet vector_cosine_ops);
CREATE INDEX IF NOT EXISTS scrapped_images_embedding_clip_idx ON scrapped_images USING hnsw (embedding_clip vector_cosine_ops);