import uvicorn
import os
import json
import uuid
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
        return Response(status_code=200, content=result, media_type="application/json")
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
        if not status and (error_maker % 3 < 2):
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



# """
# Файл, перенаправляющий запросы к FastAPI на другие сервисы.
# """

# import uvicorn
# import os
# import aiohttp
# from fastapi import FastAPI, Request, Response, Depends
# from back.logging.logger import get_logger
# from back.producer import get_producer, AIOBackProducer

# app = FastAPI()
# session: aiohttp.ClientSession
# logger = get_logger("BACK")
# server_error_code = 500
# server_error_text = "Something wrong on the server side!"


# async def send_post(request: Request, url_request: str):
#     """
#     Метод для формирования и отправки POST-запроса.

#     :param request: объект запроса.
#     :param url_request: url-адрес отправки запроса в формате str.
#     :return: Response.
#     """
#     try:
#         async with session.post(
#                 url_request,
#                 headers=request.headers,
#                 data=await request.body()
#         ) as resp:
#             return Response(status_code=resp.status,
#                             headers=resp.headers,
#                             content=await resp.content.read())
#     except Exception as e:
#         logger.error(f"Got error while processing the request! REASON: {e}")
#         return Response(status_code=server_error_code,
#                         content=server_error_text)


# async def send_get(request: Request, url_request: str):
#     """
#     Метод для формирования и отправки GET-запроса.

#     :param request: объект запроса.
#     :param url_request: url-адрес отправки запроса в формате str.
#     :return: Response.
#     """
#     try:
#         async with session.get(url_request, headers=request.headers) as resp:
#             return Response(status_code=resp.status,
#                             headers=resp.headers,
#                             content=await resp.content.read())
#     except Exception as e:
#         logger.error(f"Got error while processing the request! REASON: {e}")
#         return Response(status_code=server_error_code,
#                         content=server_error_text)


# @app.on_event("startup")
# async def startup_event():
#     global session
#     session = aiohttp.ClientSession()


# @app.on_event("shutdown")
# async def shutdown_event():
#     global session
#     await session.close()


# @app.get("/scrape")
# async def scrape(request: Request,
#                  producer: AIOBackProducer = Depends(get_producer)):
#     return await send_get(request, os.getenv('SCRAPER_URL'))


# @app.post('/hello')
# async def hello(request: Request):
#     return await send_post(request, os.getenv('GET_ONE_URL'))


# @app.get('/clear_all')
# async def clear_all(request: Request):
#     return await send_get(request, os.getenv('DELETE_URL'))


# @app.get('/highlight_all_images')
# async def highlight_all_images(request: Request):
#     return await send_get(request, os.getenv('PROCESSOR_URL'))


# @app.post('/highlight_particular_image')
# async def highlight_particular_image(request: Request):
#     return await send_post(request, os.getenv('PROCESSOR_ONE_URL'))


# @app.post('/merge_imgs')
# async def merge_imgs(request: Request):
#     return await send_post(request, os.getenv('MERGE_URL'))


# @app.post('/find_all_complementary')
# async def find_complementary(request: Request):
#     return await send_post(request, os.getenv('CV2_IMG_SEARCH_URL_HSV'))


# @app.post('/find_all_similar_by_lab')
# async def find_all_similar_by_lab(request: Request):
#     return await send_post(request, os.getenv('CV2_IMG_SEARCH_URL_LAB'))


# @app.get('/get_all_resnet_embeddings')
# async def get_all_resnet_embeddings(request: Request):
#     return await send_get(request, os.getenv('GET_EMBEDDINGS_RESNET_URL'))


# @app.get('/get_all_clip_embeddings')
# async def get_all_clip_embeddings(request: Request):
#     return await send_get(request, os.getenv('GET_EMBEDDINGS_CLIP_URL'))


# @app.post('/get_top_24_resnet_similar')
# async def get_top_24_resnet_similar(request: Request):
#     return await send_post(request, os.getenv('MODEL_IMG_SEARCH_RESNET_URL'))


# @app.post('/get_top_25_clip_similar')
# async def get_top_25_clip_similar(request: Request):
#     return await send_post(request, os.getenv('MODEL_IMG_SEARCH_CLIP_URL'))


# def start():
#     uvicorn.run(
#         "back.main:app",
#         host=os.getenv("BACK_HOST"),
#         port=int(os.getenv("BACK_PORT")),
#         reload=True
#     )
