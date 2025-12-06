import uvicorn
import os
import json
import asyncio
from contextlib import asynccontextmanager
from fastapi import FastAPI
from aiokafka import AIOKafkaConsumer, AIOKafkaProducer
from processor_images.img_processing import prepare_highlighter, prepare_merger


class ImageProcessor:
    def __init__(self):
        self.consumer = AIOKafkaConsumer(
            os.getenv('REQUEST_TOPIC'),
            bootstrap_servers=os.getenv('KAFKA_BOOTSTRAP_SERVERS'),
            group_id=os.getenv('PROCESSOR_GROUP')
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

                if request_type == 'highlight':
                    result = await prepare_highlighter(data)
                elif request_type == 'merge':
                    result = await prepare_merger(data)
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
    processor = ImageProcessor()
    await processor.start()
    yield
    await processor.stop()

app = FastAPI(lifespan=lifespan)

def start():
    uvicorn.run(
        "processor_images.main:app",
        host=os.getenv("SCRAPER_HOST"),
        port=int(os.getenv("SCRAPER_PORT")),
        reload=True
    )


# import os

# import uvicorn
# from fastapi import FastAPI, Request
# from processor_images.img_processing import prepare_highlighter, prepare_merger

# app = FastAPI()


# @app.post("/highlight_particular_img")
# async def highlight_particular_img(request: Request):
#     res = await prepare_highlighter(await request.json())
#     return res


# @app.post("/merge_two_images")
# async def merge_two_images(request: Request):
#     res = await prepare_merger(await request.json())
#     return res


# def start():
#     """Launched with `poetry run start`"""
#     uvicorn.run(
#         "processor_images.main:app",
#         host=os.getenv("SCRAPER_HOST"),
#         port=int(os.getenv("SCRAPER_PORT")),
#         reload=True
#     )
