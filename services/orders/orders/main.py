import uvicorn
import os
import json
import asyncio
from contextlib import asynccontextmanager
from fastapi import FastAPI
from aiokafka import AIOKafkaConsumer, AIOKafkaProducer
from orders.process_orders import create_order, get_all_orders
from orders.utils.db_manager import DB_Manager
from orders.utils.logger import get_logger

db_manager: DB_Manager = None
logger = get_logger("ORDERS")

class OrderProcessor:
    def __init__(self):
        self.consumer = AIOKafkaConsumer(
            os.getenv('ORDERS_REQUEST_TOPIC'),
            bootstrap_servers=os.getenv('KAFKA_BOOTSTRAP_SERVERS'),
            group_id=os.getenv('ORDERS_GROUP')
        )
        self.producer = AIOKafkaProducer(
            bootstrap_servers=os.getenv('KAFKA_BOOTSTRAP_SERVERS'),
            enable_idempotence=True,  # Включить идемпотентность
        )

    async def start(self):
        await self.producer.start()
        await self.consumer.start()
        asyncio.create_task(self.process_messages())

    async def stop(self):
        await self.producer.stop()
        await self.consumer.stop()

    async def process_messages(self):
        async for msg in self.consumer:
            try:
                message = json.loads(msg.value.decode())
                correlation_id = message['correlation_id']
                request_type = message['type']
                data = message['data']

                if request_type == 'order_create':
                    result = await create_order(db_manager, correlation_id, data, True)
                elif request_type == 'order_update':
                    try:
                        order_id = data["order_id"]
                        new_order_info = data["order_info"]
                        result = await create_order(db_manager, order_id, new_order_info, False)
                    except Exception as e:
                        logger.info(f"Error processing message: {e}")
                elif request_type == 'order_all_get':
                    result = await get_all_orders(db_manager)
                    result = {
                        record["id"]: {"order_id": record["order_id"],
                                       "order_info": record["order_info"],
                                       "order_status": record["order_status"]}           
                                       for record in result}
                else:
                    continue

                response = {
                    "correlation_id": correlation_id,
                    "result": result
                }

                await self.producer.send(
                    os.getenv('RESPONSE_TOPIC'),
                    json.dumps(response).encode('utf-8'),
                    key=correlation_id.encode(),
                )
            except Exception as e:
                print(f"Error processing message: {e}")

@asynccontextmanager
async def lifespan(app: FastAPI):
    global db_manager
    processor = OrderProcessor()
    conn_str = (f'postgresql://{os.getenv("POSTGRES_USER")}:'
            f'{os.getenv("POSTGRES_PASSWORD")}@'
            f'{os.getenv("DB_CONTAINER_NAME")}:{os.getenv("POSTGRES_PORT")}'
            f'/{os.getenv("POSTGRES_DB")}')
    db_manager = DB_Manager()
    await db_manager.connect(conn_str)
    await processor.start()
    yield
    await processor.stop()
    await db_manager.disconnect()


app = FastAPI(lifespan=lifespan)

def start():
    uvicorn.run(
        "orders.main:app",
        host=os.getenv("ORDERS_HOST"),
        port=int(os.getenv("ORDERS_PORT")),
        reload=True
    )
