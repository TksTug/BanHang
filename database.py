import libsql
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
DB_FILE = BASE_DIR / "database.sqlite"


def _column_names(cursor, table_name):
    cursor.execute(f"PRAGMA table_info({table_name})")
    return {row[1] for row in cursor.fetchall()}


def _ensure_customer(cursor, name, group_type="regular"):
    clean_name = (name or "").strip()
    if not clean_name:
        return None
    row = cursor.execute("SELECT id FROM customers WHERE lower(name) = lower(?)", (clean_name,)).fetchone()
    if row:
        return row[0]
    cursor.execute(
        "INSERT INTO customers (name, group_type, is_active) VALUES (?, ?, 1)",
        (clean_name, group_type),
    )
    return cursor.lastrowid


def _ensure_product(cursor, name, price, description="", is_available=0):
    row = cursor.execute("SELECT id FROM products WHERE lower(name) = lower(?)", (name,)).fetchone()
    if row:
        cursor.execute("UPDATE products SET price = ? WHERE id = ?", (price, row[0]))
        return row[0]
    cursor.execute(
        """
        INSERT INTO products (name, price, image_url, description, is_available, is_sold_out)
        VALUES (?, ?, ?, ?, ?, 0)
        """,
        (name, price, f"https://via.placeholder.com/600x400.png?text={name.replace(' ', '+')}", description, is_available),
    )
    return cursor.lastrowid


import libsql
import os

DB_URL = os.environ.get("TURSO_DATABASE_URL", "libsql://banhang-tungvt.turso.io")
DB_TOKEN = os.environ.get("TURSO_AUTH_TOKEN", "eyJhbGciOiJFUzI1NiIsImtpZCI6ImtleS0xIn0.eyJnZW5lcmF0ZWRieSI6ImRhc2hib2FyZCIsInN1YiI6ImJhbGhhbmctdHVuZ3Z0IiwidHlwZSI6ImFjY2Vzc190b2tlbiJ9.T8aE2_rW-jCpl92v_Jc_y0Z5h9g1N4z9v-bA4h4")

def init_db():
    conn = libsql.connect(database=DB_URL, auth_token=DB_TOKEN)
    cursor = conn.cursor()

    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS customers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
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
            id INTEGER PRIMARY KEY AUTOINCREMENT,
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
            id INTEGER PRIMARY KEY AUTOINCREMENT,
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
            id INTEGER PRIMARY KEY AUTOINCREMENT,
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
            id INTEGER PRIMARY KEY AUTOINCREMENT,
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

    cursor.execute("SELECT COUNT(*) FROM products")
    if cursor.fetchone()[0] == 0:
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

    for row in cursor.execute("SELECT id, customer_name, customer_id FROM orders").fetchall():
        if row[2] is None:
            customer_id = _ensure_customer(cursor, row[1])
            cursor.execute("UPDATE orders SET customer_id = ? WHERE id = ?", (customer_id, row[0]))

    for row in cursor.execute("SELECT id, paid_amount FROM orders WHERE paid_amount > 0").fetchall():
        exists = cursor.execute("SELECT id FROM payments WHERE order_id = ? LIMIT 1", (row[0],)).fetchone()
        if not exists:
            cursor.execute(
                "INSERT INTO payments (order_id, amount, method, note) VALUES (?, ?, ?, ?)",
                (row[0], row[1], "Cũ", "Tự chuyển từ dữ liệu đã trả"),
            )

    conn.commit()
    conn.close()


if __name__ == "__main__":
    init_db()
