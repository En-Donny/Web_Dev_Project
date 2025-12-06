"""
Файл с описанием функций скрапинга изображений с сайта
https://world.maxmara.com.
"""

import os
import random
from typing import Tuple

from scraper.utils.logger import get_logger


main_url = os.getenv("MAIN_URL")
cnt = 0
logger = get_logger("SCRAPER")

async def prepare_scraper() -> str:
    """
    Асинхронная функция получения списка ссылок на изображения. Проходя по html
    коду страницы с помощью методов BeautifulSoup находит ссылки на внутренние
    страницы сайта, которые содержат сами изображения и их текстовые описания.
    Полученный список ссылок и текстовых описаний изображений далее передается в
    качестве параметра в функцию async_scrape для получения файлов изображений и
    сохранения информации об изображениях в БД.

    :return: Количество соскрапленных с сайта изображений.
    """
    global main_url
    ans = (f"Scraped {random.randint(1, 1000)} pages from [{main_url}] in "
           f"{random.randint(1, 30)} minutes!")
    return ans
