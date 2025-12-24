import uvicorn
import os
import json
import uuid
import time
import logging
from logging.handlers import RotatingFileHandler
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request, Response
from aiokafka import AIOKafkaProducer, AIOKafkaConsumer
import asyncio
from back.utils.logger import get_logger
from back.utils.db_manager import DB_Manager

logger = get_logger("BACK")
pending_requests = {}
db_manager: DB_Manager = None
error_maker = 0
approve_send_request: callable

class KafkaClient:
    def __init__(self):
        self.producer = AIOKafkaProducer(
            bootstrap_servers=os.getenv('KAFKA_BOOTSTRAP_SERVERS'),
            enable_idempotence=True,  # Включить идемпотентность
            acks='all',
            request_timeout_ms=30000,
            retry_backoff_ms=1000
        )
        self.consumer = AIOKafkaConsumer(
            os.getenv('RESPONSE_TOPIC'),
            bootstrap_servers=os.getenv('KAFKA_BOOTSTRAP_SERVERS'),
            group_id=os.getenv('BACK_GROUP')
        )

    async def start(self):
        await self.producer.start()
        await self.consumer.start()
        asyncio.create_task(self.consume_messages())
        asyncio.create_task(self.send_notsended_tasks())


    async def stop(self):
        await self.producer.stop()
        await self.consumer.stop()

    async def consume_messages(self):
        global db_manager
        async for msg in self.consumer:
            try:
                message = json.loads(msg.value.decode())
                correlation_id = message['correlation_id']
                if correlation_id in pending_requests:
                    await db_manager.update_req_status(correlation_id)
                    pending_requests[correlation_id].set_result(message['result'])
                    del pending_requests[correlation_id]
            except Exception as e:
                logger.error(f"Error processing message: {e}")

    async def send_notsended_tasks(self):
        global db_manager
        # while True:
        not_solved = await db_manager.get_all_req_new()
        if not_solved:
            logger.info(f"Start solving not solved tasks cnt={len(not_solved)}")
            await asyncio.sleep(20)
            for task in not_solved:
                topic = None
                if task["request_type"] in ["highlight", "merge"]:
                    topic = os.getenv('REQUEST_TOPIC')
                elif "product" in task["request_type"] or "statistics" in task["request_type"]:
                    topic = os.getenv('PRODUCTS_REQUEST_TOPIC')
                else:
                    topic = os.getenv('SCRAPE_TOPIC')
                data = task["request_data"]
                res = await approve_send_request(topic, data, task["correlation_id"])
                if res.status_code == 200:
                    logger.info(f"Corr_id: {task['correlation_id']} was successfully resended!")


kafka_client: KafkaClient = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    global kafka_client, db_manager
    conn_str = (f'postgresql://{os.getenv("POSTGRES_USER")}:'
            f'{os.getenv("POSTGRES_PASSWORD")}@'
            f'{os.getenv("DB_CONTAINER_NAME")}:{os.getenv("POSTGRES_PORT")}'
            f'/{os.getenv("POSTGRES_DB")}')
    db_manager = DB_Manager()
    await db_manager.connect(conn_str)
    kafka_client = KafkaClient()
    await kafka_client.start()
    yield
    await kafka_client.stop()
    await db_manager.disconnect()

app = FastAPI(lifespan=lifespan)

@app.get("/scrape")
async def scrape(request: Request):
    return await process_request(request, 'scrape')

@app.post('/highlight_particular_image')
async def highlight_particular_image(request: Request):
    return await process_request(request, 'highlight')

@app.post('/merge_imgs')
async def merge_imgs(request: Request):
    return await process_request(request, 'merge')

@app.post('/product_create')
async def create_product(request: Request):
    return await process_request(request, 'product_create')

@app.post('/product_update')
async def create_product(request: Request):
    return await process_request(request, 'product_update')

@app.get('/product_all_get')
async def create_product(request: Request):
    return await process_request(request, 'product_all_get')

@app.get('/statistics_all_get')
async def create_product(request: Request):
    return await process_request(request, 'statistics_all_get')

@app.post('/statistics_update')
async def create_product(request: Request):
    return await process_request(request, 'statistics_update')

logger_front = logging.getLogger("cart_logger")
logger_front.setLevel(logging.INFO)
handler = RotatingFileHandler("/app/logs/logging_cart.txt", maxBytes=10*1024*1024, backupCount=5, encoding='utf-8')
formatter = logging.Formatter('%(message)s')
handler.setFormatter(formatter)
logger_front.addHandler(handler)

@app.post('/cart_log')
async def cart_log(request: Request):
    # Дополнительная валидация: ограничение размера текущ/prev
    try:
        payload = await request.json()
        # формируем строку: [Время] ||| [User: ...] ||| [event: ...] [Prev: ...] [Curr: ...]
        ts = time.strftime("%Y-%m-%d %H:%M:%S", time.gmtime())
        # user identification: если у тебя есть аутентификация, возьми user id из request.state или jwt
        client_host = request.client.host if request.client else 'unknown'
        ua = request.headers.get('user-agent', '')[:200]
        user_repr = f"user_ip={client_host}"
        # safe json dump
        # import json
        # prev_json = json.dumps(payload.prev, ensure_ascii=False)
        # curr_json = json.dumps(payload.curr, ensure_ascii=False)
        # meta_json = json.dumps(payload.meta, ensure_ascii=False)
        prev_json = payload["prev"]
        curr_json = payload["curr"]
        meta_json = payload["meta"]
        line = f"[{ts}] ||| [{user_repr}] ||| [meta: {meta_json}] ||| [prev: {prev_json}] ||| [curr: {curr_json}]"
        logger_front.info(line)
    except Exception as e:
        # не ломаем работу — возвращаем 200, но можно логировать ошибку
        logging.exception("Failed to log cart")
        return Response(status_code=500, content="Internal Server Error")
    return {"status":"ok"}


async def approve_send_request(topic, data, correlation_id):
    global kafka_client
    future = asyncio.Future()
    pending_requests[correlation_id] = future
    await kafka_client.producer.send(
        topic,
        data.encode('utf-8'),
        key=correlation_id.encode()
    )
    try:
        result = await asyncio.wait_for(future, timeout=30.0)
        # logger.info(result)
        return Response(status_code=200, content=json.dumps(result), media_type="application/json")
    except asyncio.TimeoutError:
        logger.error(f"Timeout for request {correlation_id}")
        return Response(status_code=504, content="Request timeout")
    finally:
        asyncio.create_task(
            kafka_client.send_notsended_tasks(), 
            name=f"send_notsended_tasks-{correlation_id}"
        )

async def process_request(request: Request, request_type: str):
    global kafka_client, db_manager, error_maker
    correlation_id = str(uuid.uuid4())
    future = asyncio.Future()
    pending_requests[correlation_id] = future
    try:
        topic = None
        data = {}
        if request_type in ["highlight", "merge"]:
            topic = os.getenv('REQUEST_TOPIC')
            data = await request.json()
        elif "product" in request_type or "statistic" in request_type:
            topic = os.getenv('PRODUCTS_REQUEST_TOPIC')
            if request_type != 'product_all_get' and request_type != 'statistics_all_get':
                data = await request.json()
        else:
            topic = os.getenv('SCRAPE_TOPIC')
        message = {
            "correlation_id": correlation_id,
            "type": request_type,
            "data": data
        }
        data = json.dumps(message)
        status = await db_manager.insert_new_request(correlation_id, request_type, data)
        error_maker += 1
        if not status and (error_maker % 8 != 8):
            logger.info(f"Task successfully added to outbox!")
            return await approve_send_request(topic, data, correlation_id)
    except Exception as e:
        logger.error(f"Error processing request: {e}")
        return Response(status_code=500, content="Internal Server Error")
    finally:
        if correlation_id in pending_requests:
            del pending_requests[correlation_id]

def start():
    uvicorn.run(
        "back.main:app",
        host=os.getenv("BACK_HOST"),
        port=int(os.getenv("BACK_PORT")),
        reload=True
    )
