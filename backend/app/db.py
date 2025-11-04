import psycopg
from psycopg.rows import dict_row

def get_conn(dsn: str):
    return psycopg.connect(dsn, row_factory=dict_row)

def column_exists(dsn: str, table: str, column: str) -> bool:
    with get_conn(dsn) as conn, conn.cursor() as cur:
        cur.execute(
            '''
            SELECT 1
            FROM information_schema.columns
            WHERE table_name = %s AND column_name = %s
            LIMIT 1
            ''',
            (table, column),
        )
        return cur.fetchone() is not None
