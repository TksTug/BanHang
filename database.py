import os
import psycopg2
from psycopg2.extras import RealDictCursor
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent

# Supabase PostgreSQL connection URL configuration
DB_URL = os.environ.get(
    "DATABASE_URL",
    "postgresql://postgres:thanhtung1809@db.stdpwepddxysbxrnfczr.supabase.co:5432/postgres"
)

def get_db_conn():
    db_url = os.environ.get("DATABASE_URL")
    if db_url:
        return psycopg2.connect(db_url)
    
    host = os.environ.get("DB_HOST", "db.stdpwepddxysbxrnfczr.supabase.co")
    port = os.environ.get("DB_PORT", "5432")
    dbname = os.environ.get("DB_NAME", "postgres")
    user = os.environ.get("DB_USER", "postgres")
    password = os.environ.get("DB_PASSWORD", "thanhtung1809")
    
    return psycopg2.connect(
        host=host,
        port=port,
        dbname=dbname,
        user=user,
        password=password
    )

def _column_names(cursor, table_name):
    cursor.execute(
        "SELECT column_name FROM information_schema.columns WHERE table_name = %s",
        (table_name,),
    )
    return {row["column_name"] for row in cursor.fetchall()}

def _ensure_customer(cursor, name, group_type="regular"):
    clean_name = (name or "").strip()
    if not clean_name:
        return None
    cursor.execute("SELECT id FROM customers WHERE lower(name) = lower(%s)", (clean_name,))
    row = cursor.fetchone()
    if row:
        return row["id"]
    cursor.execute(
        "INSERT INTO customers (name, group_type, is_active) VALUES (%s, %s, 1) RETURNING id",
        (clean_name, group_type),
    )
    return cursor.fetchone()["id"]

def _ensure_product(cursor, name, price, description="", is_available=0):
    cursor.execute("SELECT id FROM products WHERE lower(name) = lower(%s)", (name,))
    row = cursor.fetchone()
    if row:
        cursor.execute("UPDATE products SET price = %s WHERE id = %s", (price, row["id"]))
        return row["id"]
    cursor.execute(
        """
        INSERT INTO products (name, price, image_url, description, is_available, is_sold_out)
        VALUES (%s, %s, %s, %s, %s, 0) RETURNING id
        """,
        (name, price, f"https://via.placeholder.com/600x400.png?text={name.replace(' ', '+')}", description, is_available),
    )
    return cursor.fetchone()["id"]

def init_db():
    conn = get_db_conn()
    cursor = conn.cursor(cursor_factory=RealDictCursor)

    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS customers (
            id SERIAL PRIMARY KEY,
            name TEXT NOT NULL UNIQUE,
            group_type TEXT NOT NULL DEFAULT 'regular',
            is_active INTEGER DEFAULT 1,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
        """
    )

    customer_columns = _column_names(cursor, "customers")
    if "initial_debt" not in customer_columns:
        cursor.execute("ALTER TABLE customers ADD COLUMN initial_debt REAL DEFAULT 0")

    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS products (
            id SERIAL PRIMARY KEY,
            name TEXT NOT NULL,
            price REAL NOT NULL,
            image_url TEXT,
            description TEXT,
            is_available INTEGER DEFAULT 1,
            is_sold_out INTEGER DEFAULT 0
        )
        """
    )
    product_columns = _column_names(cursor, "products")
    if "is_available" not in product_columns:
        cursor.execute("ALTER TABLE products ADD COLUMN is_available INTEGER DEFAULT 1")
    if "is_sold_out" not in product_columns:
        cursor.execute("ALTER TABLE products ADD COLUMN is_sold_out INTEGER DEFAULT 0")

    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS orders (
            id SERIAL PRIMARY KEY,
            customer_id INTEGER,
            customer_name TEXT NOT NULL,
            total_amount REAL NOT NULL,
            paid_amount REAL DEFAULT 0,
            payment_method TEXT NOT NULL,
            note TEXT,
            is_paid INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL
        )
        """
    )
    order_columns = _column_names(cursor, "orders")
    if "paid_amount" not in order_columns:
        cursor.execute("ALTER TABLE orders ADD COLUMN paid_amount REAL DEFAULT 0")
        cursor.execute("UPDATE orders SET paid_amount = CASE WHEN is_paid = 1 THEN total_amount ELSE 0 END")
    if "customer_id" not in order_columns:
        cursor.execute("ALTER TABLE orders ADD COLUMN customer_id INTEGER")
    if "note" not in order_columns:
        cursor.execute("ALTER TABLE orders ADD COLUMN note TEXT")

    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS order_items (
            id SERIAL PRIMARY KEY,
            order_id INTEGER NOT NULL,
            product_id INTEGER,
            product_name TEXT NOT NULL,
            price REAL NOT NULL,
            quantity INTEGER NOT NULL,
            FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
            FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL
        )
        """
    )

    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS payments (
            id SERIAL PRIMARY KEY,
            order_id INTEGER NOT NULL,
            amount REAL NOT NULL,
            method TEXT,
            note TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
        )
        """
    )

    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS daily_settings (
            order_date TEXT PRIMARY KEY,
            is_closed INTEGER DEFAULT 0,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
        """
    )

    cursor.execute("SELECT COUNT(*) AS count FROM products")
    if cursor.fetchone()["count"] == 0:
        products_data = [
            ("Phở bò", 50000, "Phở bò nóng hổi với nước dùng đậm đà.", 1),
            ("Bún chả", 45000, "Bún chả Hà Nội ăn kèm rau sống.", 1),
            ("Nem rán", 30000, "Nem rán giòn, chấm nước mắm chua ngọt.", 1),
            ("Nước cam", 20000, "Nước cam tươi mát.", 1),
            ("Trà đá", 10000, "Trà đá giải khát.", 1),
        ]
        for name, price, description, is_available in products_data:
            _ensure_product(cursor, name, price, description, is_available)

    daily_foods = [
        "Gà kho",
        "Gà chiên",
        "Thịt kho trứng cút kho đậu hủ",
        "Đậu hũ nhồi",
        "Thịt xay chiên lá lốt",
        "Cá rô kho",
        "Cá lóc kho",
        "Cá ba sa kho",
        "Cá thu Nhật kho",
        "Cá ngừ kho",
        "Canh khổ qua",
        "Canh chua cá lóc",
        "Canh chua cá ba sa",
        "Thịt kho củ cải",
    ]
    for name in daily_foods:
        _ensure_product(cursor, name, 30000, "Món đồng giá 30.000đ.", 0)

    cursor.execute("SELECT id, customer_name, customer_id FROM orders")
    for row in cursor.fetchall():
        if row["customer_id"] is None:
            customer_id = _ensure_customer(cursor, row["customer_name"])
            cursor.execute("UPDATE orders SET customer_id = %s WHERE id = %s", (customer_id, row["id"]))

    cursor.execute("SELECT id, paid_amount FROM orders WHERE paid_amount > 0")
    for row in cursor.fetchall():
        cursor.execute("SELECT id FROM payments WHERE order_id = %s LIMIT 1", (row["id"],))
        exists = cursor.fetchone()
        if not exists:
            cursor.execute(
                "INSERT INTO payments (order_id, amount, method, note) VALUES (%s, %s, %s, %s)",
                (row["id"], row["paid_amount"], "Cũ", "Tự chuyển từ dữ liệu đã trả"),
            )

    conn.commit()
    cursor.close()
    conn.close()

if __name__ == "__main__":
    init_db()
