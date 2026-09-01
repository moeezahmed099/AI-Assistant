import os
import psycopg2
from psycopg2.extras import RealDictCursor
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")

if not DATABASE_URL:
    raise ValueError("DATABASE_URL is missing from .env")


def get_connection():
    """
    Returns a new Postgres connection. Caller is responsible
    for closing it (use in a try/finally or context manager).
    """
    return psycopg2.connect(DATABASE_URL, cursor_factory=RealDictCursor)