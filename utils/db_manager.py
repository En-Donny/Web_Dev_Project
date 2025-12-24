"""
Файл с описанием класса базы данных для хранения изображений.
"""

import asyncpg

request_status_success = 0
request_status_failure = 1

from .logger import get_logger

logger = get_logger("DB_MANAGER")


class DB_Manager:
    """
    DB_Manager класс, предназначенный для работы с таблицами в Postgres.
    """

    def __init__(self):
        self.pool = None

    async def connect(self, conn_string):
        """
        Метод для подключения к базе данных postgres.

        :param conn_string: Строка, представляющая адрес для подключения к базе
        данных по postgresql протоколу.
        :return: None.
        """
        try:
            self.pool = await asyncpg.create_pool(conn_string)
            if self.pool is not None:
                logger.info(f"Connection to DB successfully created!")
        except Exception as e:
            logger.error(f"Error connecting to database: {e}")
            raise ConnectionError(f"Error connecting to database: {e}")

    async def disconnect(self):
        """
        Метод закрытия соединения с базой данных.

        :return: None.
        """
        await self.pool.close()

    async def insert_new_request(self,
                                 correlation_id,
                                 request_type,
                                 request_data):
        """
        Метод для вставки данных о новов запросе в таблицу outbox.

        :param correlation_id: ID запроса.
        :param request_type: Тип запроса.
        :param request_data: Данные запроса.
        :return: Флаг статуса вставки изображения в таблицу.
        """
        query = """
        INSERT INTO public.outbox (correlation_id, request_type, request_data, status_request)
        VALUES ($1, $2, $3, $4)
        """
        try:
            await self.pool.execute(query, correlation_id, request_type, request_data, 'new')
            return request_status_success
        except asyncpg.exceptions.UniqueViolationError:
            return request_status_failure
        

    async def get_all_req_new(self):
        """
        Метод для получения всех нерешенных тасок.

        :return: Record или сообщение об ошибке, обернутое в список.
        """
        query = """
        SELECT * FROM public.outbox
        WHERE status_request = 'new'
        """
        try:
            return await self.pool.fetch(query)
        except:
            return ["FAILED OF SEARCHING"]

    async def update_req_status(self, correlation_id):
        """
        Метод, предназначенный для получения из таблицы всех записей
        изображений, которые еще не были обработаны.

        :return: Список Record'ов или сообщение об ошибке, обернутое в список.
        """
        query = """
        UPDATE public.outbox SET status_request = 'solved'
        WHERE correlation_id = $1
        """
        try:
            await self.pool.execute(query, correlation_id)
        except Exception as e:
            logger.error(f"Got error while updating record in DB! REASON {e}")


    async def create_new_product(self,
                               product_id,
                               product_info):
        """
        Метод для вставки данных о новом заказе в таблицу products.

        :param product_id: ID заказа.
        :param product_info: информация заказа.
        :param product_status: статус заказа.
        :return: Флаг статуса вставки изображения в таблицу.
        """
        query = """
        INSERT INTO public.products (product_id,
                                   product_info,
                                   product_status)
        VALUES ($1, $2, $3)
        """
        try:
            await self.pool.execute(query, product_id, product_info, 'new')
            return request_status_success
        except asyncpg.exceptions.UniqueViolationError:
            return request_status_failure

    async def update_product_info(self, product_id, new_data):
        """
        Метод, предназначенный для изменения информации о заказе

        :return: Список Record'ов или сообщение об ошибке, обернутое в список.
        """
        query = """
        UPDATE public.products SET product_info = $2, product_status = 'changed'
        WHERE product_id = $1
        """
        try:
            await self.pool.execute(query, product_id, new_data)
        except Exception as e:
            logger.error(f"Got error while updating record in DB! REASON {e}")

    async def get_all_products(self):
        """
        Метод для получения всех товаров.

        :return: Record или сообщение об ошибке, обернутое в список.
        """
        query = """
        SELECT * FROM public.products
        """
        try:
            return await self.pool.fetch(query)
        except:
            return ["FAILED OF SEARCHING"]

    async def update_statistics(self, stats_delta_list):
        """
        Метод для пакетного инкрементного обновления статистики
        
        :param stats_delta_list: Список кортежей [(product_id, rejected_delta, success_delta), ...]
        :return: None или сообщение об ошибке
        """
        query = """
        INSERT INTO statistics (product_id, rejected_orders, success_orders)
        VALUES ($1, $2, $3)
        ON CONFLICT (product_id) 
        DO UPDATE SET 
            rejected_orders = GREATEST(statistics.rejected_orders + EXCLUDED.rejected_orders, 0),
            success_orders = GREATEST(statistics.success_orders + EXCLUDED.success_orders, 0)
        """
        try:
            await self.pool.executemany(query, stats_delta_list)
        except Exception as e:
            logger.error(f"Got error while bulk incrementing statistics! REASON: {e}")

    async def get_all_stats(self):
        """
        Метод для получения всех статистик по товарам.

        :return: Record или сообщение об ошибке, обернутое в список.
        """
        query = """
        SELECT pr.id, pr.product_id, pr.product_info, st.rejected_orders, st.success_orders 
        FROM public.products pr
        JOIN public.statistics st
        ON st.product_id = pr.id
        """
        try:
            return await self.pool.fetch(query)
        except:
            return ["FAILED OF SEARCHING"]

    async def clear_all(self):
        """
        Метод для очистки содержимого таблицы с информацией об изображениях.

        :return: Сообщение о статусе очистки базы данных.
        """
        query = """
        DELETE FROM public.outbox
        """
        try:
            return await self.pool.execute(query)
        except:
            return ["FAILED OF DELETING"]
