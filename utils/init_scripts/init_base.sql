-- Проверяем, существует ли БД, и создаем только если её нет
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = 'docker_test') THEN
        CREATE DATABASE docker_test;
    END IF;
END
$$;

-- Подключаемся к БД
\c docker_test;

CREATE TABLE IF NOT EXISTS outbox (
    id SERIAL PRIMARY KEY,
    correlation_id TEXT NOT NULL,
    request_type TEXT NOT NULL,
    request_data JSON NOT NULL,
    status_request TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS products (
    id SERIAL PRIMARY KEY,
    product_id TEXT NOT NULL,
    product_info JSON NOT NULL,
    product_status TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS statistics (
    id SERIAL PRIMARY KEY,
    product_id INT NOT NULL,
    rejected_orders INT NOT NULL,
    success_orders INT NOT NULL,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE cascade
);
ALTER TABLE statistics ADD CONSTRAINT statistics_product_id_unique UNIQUE (product_id);

GRANT ALL PRIVILEGES ON DATABASE docker_test TO postgres;
ALTER DATABASE docker_test OWNER TO postgres;
