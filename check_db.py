from dotenv import load_dotenv
load_dotenv('backend/.env')
from app.db.database import get_connection
with get_connection() as conn:
    cur = conn.cursor()
    cur.execute('SELECT COUNT(*), MIN(id), MAX(id) FROM catalog_items')
    print(tuple(cur.fetchone()))
