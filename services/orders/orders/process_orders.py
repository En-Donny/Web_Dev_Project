import json
from orders.utils.logger import get_logger

logger = get_logger("PROCESSOR_ORDERS")

dict_status = {True: "added to", False: "updated in"}

async def create_order(db_manager, order_id, order_data, flag_creation=True):
    order_data = json.dumps(order_data)
    if flag_creation:
        status = await db_manager.create_new_order(order_id, order_data)
    else:
        status = await db_manager.update_order_info(order_id, order_data)
    if not status:
        logger.info(f"Order [{order_id}] successfully {dict_status[flag_creation]} order table!")
        return f"Order [{order_id}] successfully {dict_status[flag_creation]} order table!"
    else:
        logger.info(f"Something gone wrong in db_manager side!")
        return f"Something gone wrong in db_manager side! Order [{order_id}] has not be {dict_status[flag_creation]} order table!"
    
async def get_all_orders(db_manager):
    return await db_manager.get_all_orders()
