import uvicorn
import os
import json
import asyncio
from contextlib import asynccontextmanager
from fastapi import FastAPI
from aiokafka import AIOKafkaConsumer, AIOKafkaProducer
from scraper.scraper import prepare_scraper


class ImageScraper:
    def __init__(self):
        self.consumer = AIOKafkaConsumer(
            os.getenv('SCRAPE_TOPIC'),
            bootstrap_servers=os.getenv('KAFKA_BOOTSTRAP_SERVERS'),
            group_id=os.getenv('SCRAPER_GROUP')
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

                if request_type == 'scrape':
                    result = await prepare_scraper()
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
    processor = ImageScraper()
    await processor.start()
    yield
    await processor.stop()

app = FastAPI(lifespan=lifespan)

def start():
    """Launched with `poetry run start`"""
    uvicorn.run(
        "scraper.main:app",
        host=os.getenv("SCRAPER_HOST"),
        port=int(os.getenv("SCRAPER_PORT")),
        reload=True
    )



# import os

# import uvicorn
# from fastapi import FastAPI

# from scraper.scraper import prepare_scraper

# app = FastAPI()


# @app.get("/scrape")
# async def scrape():
#     ans = await prepare_scraper()
#     return {"answer": f"Scraping successfully completed! {ans}"}


# def start():
#     """Launched with `poetry run start`"""
#     uvicorn.run(
#         "scraper.main:app",
#         host=os.getenv("SCRAPER_HOST"),
#         port=int(os.getenv("SCRAPER_PORT")),
#         reload=True
#     )
