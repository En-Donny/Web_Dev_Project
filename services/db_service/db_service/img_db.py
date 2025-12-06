"""
Файл с описанием класса базы данных для хранения изображений.
"""

import asyncpg

request_status_success = 0
request_status_failure = 1

from db_service.logging.logger import get_logger

logger = get_logger("DB_SERVICE")


class IMGDatabase:
    """
    IMGDatabase класс, предназначенный для работы с таблицами в Postgres.
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
        except Exception as e:
            logger.error(f"Error connecting to database: {e}")
            raise ConnectionError(f"Error connecting to database: {e}")

    async def disconnect(self):
        """
        Метод закрытия соединения с базой данных.

        :return: None.
        """
        await self.pool.close()

    async def insert_scrapped_imgs(self, image_name, image_hash, image_path):
        """
        Метод для вставки данных о соскрапленном с сайта изображении в таблицу.
        Принимает название описание изображение, хэш изображения,
        конвертированный в str тип, и относительный путь до изображения.

        :param image_name: Текстовое описание (имя) изображения. Необходимо для
            алгоритмов поиска по изображению и поиска по тексту.
        :param image_hash: Конвертированное в str тип вычисленное на этапе
            скрапинга значение хэша изображения.
        :param image_path: Относительный путь до файла изображения.
        :return: Флаг статуса вставки изображения в таблицу.
        """
        query = """
        INSERT INTO public.scrapped_images (img_name, img_hash, img_path)
        VALUES ($1, $2, $3)
        """
        try:
            await self.pool.execute(query, image_name, image_hash, image_path)
            return request_status_success
        except asyncpg.exceptions.UniqueViolationError:
            return request_status_failure

    async def get_by_filename(self, image_path):
        """
        Метод, предназначенный для получения информации об изображении из базы
        данных по пути до изображения.

        :param image_path: Полный путь изображения.
        :return: Record или сообщение об ошибке, обернутое в список.
        """
        query = """
        SELECT * FROM scrapped_images
        WHERE img_path = $1
        """
        try:
            return await self.pool.fetch(query, image_path)
        except:
            return ["FAILED OF SEARCHING"]

    async def get_all_not_highlighted_imgs(self):
        """
        Метод, предназначенный для получения из таблицы всех записей
        изображений, которые еще не были обработаны.

        :return: Список Record'ов или сообщение об ошибке, обернутое в список.
        """
        query = """
        SELECT * FROM scrapped_images
        WHERE is_highlighted is FALSE
        """
        try:
            return await self.pool.fetch(query)
        except:
            return ["FAILED OF SEARCHING"]

    async def get_all_not_embedded_images(self, model):
        """
        Метод, предназначенный для получения из таблицы всех записей
        изображений, которые еще не были преобразованы в эмбеддинги.
        Используется для обеих моделей: как для ResNet, так и для CLIP. Если в
        качестве model был передан 'resnet', найдутся все записи с пустым
        столбцом 'embedding_resnet'. Аналогично для значения model='clip' будет
        проверяться столбец 'embedding_clip'.

        :param model: Название модели: resnet или clip.
        :return: Список Record'ов или сообщение об ошибке, обернутое в список.
        """
        if model == "resnet":
            query = """
            SELECT id, img_path FROM scrapped_images
            WHERE embedding_resnet is NULL
            """
        else:
            query = """
            SELECT id, img_path FROM scrapped_images
            WHERE embedding_clip is NULL
            """
        try:
            return await self.pool.fetch(query)
        except:
            return ["FAILED OF SEARCHING"]

    async def update_embedding(self, list_id_emb, model):
        """
        Метод, предназначенный для вставки вычисленных эмбеддингов изображений
        в таблицу в столбец в соответствии со значением model: для
        model='resnet' вставка будет производиться в столбец 'embedding_resnet',
        для model='resnet' - в 'embedding_clip'.

        :param list_id_emb: Список из кортежей id и эмбеддингов для вставки.
        :param model: Название модели: resnet или clip.
        :return: None.
        """
        if model == "resnet":
            query = """
            UPDATE scrapped_images SET embedding_resnet = $2 WHERE id = $1
            """
        else:
            query = """
            UPDATE scrapped_images SET embedding_clip = $2 WHERE id = $1
            """
        try:
            await self.pool.executemany(query, list_id_emb)
        except Exception as e:
            logger.error(f"Got error while updating record in DB! REASON {e}")

    async def get_top_similar_images(self, embedding, model):
        """
        Метод, предназначенный для поиска наиболее соответствующих запросу
        изображений в БД. Для модели ResNet в качестве аргументов передается
        вычисленный эмбеддинг входного изображения и model='resnet', для модели
        CLIP - вычисленный эмбеддинг текстового запроса и model='clip'. Для
        сравнения схожести с переданным эмбеддингом используется косинусная
        мера, вычисляющаяся благодаря двум индексам, поднятым при инициализации
        БД, на основе метода hnsw.

        :param embedding: Эмбеддинг входного изображения или текстового запроса.
        :param model: Название модели: resnet или clip.
        :return: Список Record'ов.
        """
        if model == "resnet":
            query = """
            SELECT img_path
            FROM scrapped_images
            ORDER BY embedding_resnet <-> $1
            LIMIT 24;
            """
        else:
            query = """
            SELECT img_path
            FROM scrapped_images
            ORDER BY embedding_clip <-> $1
            LIMIT 25;
            """
        try:
            return await self.pool.fetch(query, embedding)
        except Exception as e:
            logger.error(f"Got error while getting top similar images from DB! "
                         f"REASON {e}")

    async def update_one_record(self,
                                image_id: int,
                                image_name: str,
                                image_hash,
                                image_path,
                                is_highlighted):
        """
        Метод, предназначенный для изменения записи в таблице.

        :param image_id: ID записи в таблице.
        :param image_name: Имя изображения в таблице.
        :param image_hash: Хэш изображения в таблице.
        :param image_path: Полный путь до изображения.
        :param is_highlighted: Флаг обработанности изображения.
        :return: None.
        """
        query = """
        UPDATE 
            scrapped_images 
        SET 
            img_name = $2, 
            img_hash = $3, 
            img_path = $4, 
            is_highlighted = $5
        WHERE 
            id = $1;
        """
        try:
            await self.pool.execute(query,
                                    image_id,
                                    image_name,
                                    image_hash,
                                    image_path,
                                    is_highlighted)
        except Exception as e:
            logger.error(f"Got error while updating record in DB! REASON {e}")

    async def clear_all(self):
        """
        Метод для очистки содержимого таблицы с информацией об изображениях.

        :return: Сообщение о статусе очистки базы данных.
        """
        query = """
        DELETE FROM scrapped_images
        """
        try:
            return await self.pool.execute(query)
        except:
            return ["FAILED OF DELETING"]
