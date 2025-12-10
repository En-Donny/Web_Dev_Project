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

CREATE TABLE IF NOT EXISTS orders (
    id SERIAL PRIMARY KEY,
    order_id TEXT NOT NULL,
    order_info JSON NOT NULL,
    order_status TEXT NOT NULL
);


GRANT ALL PRIVILEGES ON DATABASE docker_test TO postgres;
ALTER DATABASE docker_test OWNER TO postgres;
