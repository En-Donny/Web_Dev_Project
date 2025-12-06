from pydantic import BaseModel


# Класс для запроса вставки в базу данных
class InsertScrappedImgParams(BaseModel):
    img_name: str
    img_hash: str
    img_path: str


# Класс для запроса получения данных из базы
class GetScrappedImgParams(BaseModel):
    img_path: str


# Класс для запроса изменения записи в базе
class UpdateScrappedImgParams(BaseModel):
    id: int
    img_name: str
    img_hash: str
    img_path: str
    is_highlighted: bool


# Класс для запроса обновление значений эмбеддингов в базе
class UpdateEmbeddings(BaseModel):
    list_id_emb: list[tuple[int, str]]


# Класс для запроса поиска наиболее соответствующих по косинусной мере записей
# в базе
class GetTopSimilar(BaseModel):
    embedding_list: str

