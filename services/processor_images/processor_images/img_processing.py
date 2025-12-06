from typing import Union
from processor_images.utils.logger import get_logger

logger = get_logger("PROCESSOR_IMAGES")


async def prepare_merger(filepathes: dict) -> str:
    """
    Функция, принимающая тело запроса, состоящего из путей до изображений.

    :param filepathes: Dictionary вида {"img_path_1": "путь_до_изображения_1",
    "img_path_2": "путь_до_изображения_2"}.
    :return: np.ndarray изображение или None.
    """
    img_path_1 = filepathes.get("img_path_1")
    img_path_2 = filepathes.get("img_path_2")
    if img_path_1 and img_path_2:
        return (f"Images [{img_path_1}] and [{img_path_2}] were successfully "
                f"merged!")
    else:
        logger.info(f"One or more arguments are missing for this function!!!")
        return None

async def prepare_highlighter(filepath: Union[dict, None] = None):
    """
    Функция, позволяющая удалять фон со всех соскрапленных и еще необработанных
    изображений или только с определенного изображения, путь к которому передан
    в функцию в качестве параметра.

    :param filepath: Dictionary вида {"img_path": "путь_до_изображения"} или
        None.
    :return:
    """
    img_path = filepath.get("img_path")
    try:
        return (f"Image [{img_path}] was successfully highlighted!")
    except Exception as e:
        logger.error(f"Got error while processing highlight image. REASON: {e}")
