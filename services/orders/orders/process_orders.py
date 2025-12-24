import json
from orders.utils.logger import get_logger

logger = get_logger("PROCESSOR_ORDERS")

dict_status = {True: "added to", False: "updated in"}

async def create_product(db_manager, product_id, product_data, flag_creation=True):
    product_data = json.dumps(product_data)
    if flag_creation:
        status = await db_manager.create_new_product(product_id, product_data)
    else:
        status = await db_manager.update_product_info(product_id, product_data)
    if not status:
        logger.info(f"product [{product_id}] successfully {dict_status[flag_creation]} product table!")
        return f"product [{product_id}] successfully {dict_status[flag_creation]} product table!"
    else:
        logger.info(f"Something gone wrong in db_manager side!")
        return f"Something gone wrong in db_manager side! product [{product_id}] has not be {dict_status[flag_creation]} product table!"
    
async def get_all_products(db_manager):
    return await db_manager.get_all_products()

async def get_all_stats(db_manager):
    return await db_manager.get_all_stats()

async def update_statistics(db_manager, stats_delta_list):
    status = await db_manager.update_statistics(stats_delta_list)
    if not status:
        logger.info(f"All statistics successfully updated!")
        return f"All statistics successfully updated!"
    else:
        logger.info(f"Something gone wrong in db_manager side!")
        return f"Something gone wrong in db_manager side!"