import os
import sys
import sqlite3
import hashlib
import platform
import re
from datetime import datetime

def get_resource_path(relative_path):
    """ Resolves paths for both development and PyInstaller bundled states """
    try:
        base_path = sys._MEIPASS
    except AttributeError:
        base_path = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    return os.path.join(base_path, relative_path)

def get_app_dir():
    app_name = "Laven"
    if platform.system() == "Windows":
        base = os.environ.get("LOCALAPPDATA", os.path.expanduser("~"))
    else: # Linux / macOS
        base = os.path.expanduser("~/.config")
    
    path = os.path.join(base, app_name)
    os.makedirs(path, exist_ok=True)
    return path

def parse_to_iso(date_str):
    if not date_str:
        return None
    date_str = date_str.strip()
    if re.match(r'^\d{4}-\d{2}-\d{2}( \d{2}:\d{2}:\d{2})?$', date_str):
        return date_str
    
    for fmt in ("%b %d, %Y %I:%M %p", "%b %d, %Y %l:%M %p", "%Y-%m-%d %H:%M:%S", "%b %d, %Y"):
        try:
            dt = datetime.strptime(date_str, fmt)
            if fmt == "%b %d, %Y":
                return dt.strftime("%Y-%m-%d")
            return dt.strftime("%Y-%m-%d %H:%M:%S")
        except ValueError:
            continue
    return date_str

def format_to_friendly(iso_str):
    if not iso_str or iso_str == "-":
        return "-"
    iso_str = iso_str.strip()
    
    try:
        dt = datetime.strptime(iso_str, "%Y-%m-%d %H:%M:%S")
        formatted = dt.strftime("%b %d, %Y %I:%M %p")
        # Strip leading zero from hours: e.g. "Oct 25, 2023 03:30 PM" -> "Oct 25, 2023 3:30 PM"
        parts = formatted.split(" ")
        time_part = parts[-2]
        ampm_part = parts[-1]
        hour, minute = time_part.split(":")
        hour = str(int(hour))
        parts[-2] = f"{hour}:{minute}"
        return " ".join(parts)
    except ValueError:
        pass
        
    try:
        dt = datetime.strptime(iso_str, "%Y-%m-%d")
        return dt.strftime("%b %d, %Y")
    except ValueError:
        pass
        
    return iso_str

class BaseService:
    def __init__(self, api):
        self.api = api
        self.db_name = os.path.join(get_app_dir(), 'database.db')
        self.init_db()

    def get_connection(self):
        conn = sqlite3.connect(self.db_name, check_same_thread=False)
        return conn

    def init_db(self):
        if not os.path.exists(self.db_name):
            print("Creating new SQLite database...")
            conn = sqlite3.connect(self.db_name)
            cursor = conn.cursor()
            schema_path = get_resource_path('database_schema.sql')
            with open(schema_path, 'r') as sql_file:
                sql_script = sql_file.read()
            cursor.executescript(sql_script)
            conn.commit()
            conn.close()
            print("Database and tables successfully created!")
        else:
            print("Database already exists. Ready to connect.")

        # Table schema upgrades & seeding
        try:
            conn = self.get_connection()
            cursor = conn.cursor()
            
            # Check User Table migration
            cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='User'")
            table_exists = cursor.fetchone()
            if table_exists:
                cursor.execute("SELECT sql FROM sqlite_master WHERE type='table' AND name='User'")
                user_sql = cursor.fetchone()
                if user_sql and "'Developer'" not in user_sql[0]:
                    print("Upgrading User table for 'Developer' role support...")
                    cursor.execute("ALTER TABLE User RENAME TO User_old")
                    cursor.execute("""
                        CREATE TABLE User(
                             userID INTEGER PRIMARY KEY AUTOINCREMENT,
                             username TEXT UNIQUE NOT NULL,
                             passwordHash TEXT NOT NULL,
                             role TEXT CHECK(role IN ('Admin', 'Staff', 'Developer')) NOT NULL DEFAULT 'Staff',
                             employeeID INTEGER,
                             isActive INTEGER DEFAULT 1,
                             FOREIGN KEY (employeeID) REFERENCES Employee(employeeID) ON DELETE SET NULL
                        )
                    """)
                    cursor.execute("""
                        INSERT INTO User (userID, username, passwordHash, role, employeeID, isActive)
                        SELECT userID, username, passwordHash, role, employeeID, isActive FROM User_old
                    """)
                    cursor.execute("DROP TABLE User_old")
                    conn.commit()
            
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS User(
                     userID INTEGER PRIMARY KEY AUTOINCREMENT,
                     username TEXT UNIQUE NOT NULL,
                     passwordHash TEXT NOT NULL,
                     role TEXT CHECK(role IN ('Admin', 'Staff', 'Developer')) NOT NULL DEFAULT 'Staff',
                     employeeID INTEGER,
                     isActive INTEGER DEFAULT 1,
                     FOREIGN KEY (employeeID) REFERENCES Employee(employeeID) ON DELETE SET NULL
                )
            """)
            conn.commit()
            
            # Default Seed
            cursor.execute("SELECT COUNT(*) FROM User")
            if cursor.fetchone()[0] == 0:
                admin_hash = hashlib.sha256("admin123".encode('utf-8')).hexdigest()
                staff_hash = hashlib.sha256("staff123".encode('utf-8')).hexdigest()
                cursor.execute("INSERT INTO User (username, passwordHash, role) VALUES ('admin', ?, 'Admin')", (admin_hash,))
                cursor.execute("INSERT INTO User (username, passwordHash, role) VALUES ('staff', ?, 'Staff')", (staff_hash,))
                conn.commit()
            
            # Developer Seed
            cursor.execute("SELECT COUNT(*) FROM User WHERE username = 'developer'")
            if cursor.fetchone()[0] == 0:
                dev_hash = hashlib.sha256("developer123".encode('utf-8')).hexdigest()
                cursor.execute("INSERT INTO User (username, passwordHash, role) VALUES ('developer', ?, 'Developer')", (dev_hash,))
                conn.commit()

            # Check Payment status column migration
            cursor.execute("PRAGMA table_info(Payment)")
            columns = [info[1] for info in cursor.fetchall()]
            if "status" not in columns:
                print("Upgrading Payment table with status column...")
                cursor.execute("ALTER TABLE Payment ADD COLUMN status TEXT CHECK(status IN ('Completed', 'Cancelled')) NOT NULL DEFAULT 'Completed'")
                conn.commit()
                
            conn.close()
        except Exception as e:
            print(f"Migration error: {e}")

        # Run Date Format string migration to ISO-8601
        self.migrate_dates_to_iso()

    def migrate_dates_to_iso(self):
        try:
            conn = self.get_connection()
            cursor = conn.cursor()
            
            # Migrate Customer joinedDate
            cursor.execute("SELECT customerID, joinedDate FROM Customer")
            for cid, joined in cursor.fetchall():
                iso_date = parse_to_iso(joined)
                if iso_date != joined:
                    cursor.execute("UPDATE Customer SET joinedDate = ? WHERE customerID = ?", (iso_date, cid))
            
            # Migrate Employee joinedDate
            cursor.execute("SELECT employeeID, joinedDate FROM Employee")
            for eid, joined in cursor.fetchall():
                iso_date = parse_to_iso(joined)
                if iso_date != joined:
                    cursor.execute("UPDATE Employee SET joinedDate = ? WHERE employeeID = ?", (iso_date, eid))
            
            # Migrate LaundryOrder datePlaced, dateClaimed
            cursor.execute("SELECT LaundryOrderID, datePlaced, dateClaimed FROM LaundryOrder")
            for oid, placed, claimed in cursor.fetchall():
                iso_placed = parse_to_iso(placed)
                iso_claimed = parse_to_iso(claimed) if claimed else None
                if iso_placed != placed or iso_claimed != claimed:
                    cursor.execute("UPDATE LaundryOrder SET datePlaced = ?, dateClaimed = ? WHERE LaundryOrderID = ?", (iso_placed, iso_claimed, oid))
            
            # Migrate Payment paymentDate
            cursor.execute("SELECT paymentID, paymentDate FROM Payment")
            for pid, pdate in cursor.fetchall():
                iso_pdate = parse_to_iso(pdate)
                if iso_pdate != pdate:
                    cursor.execute("UPDATE Payment SET paymentDate = ? WHERE paymentID = ?", (iso_pdate, pid))
            
            conn.commit()
            conn.close()
            print("Successfully standardized database date strings to ISO-8601.")
        except Exception as e:
            print(f"Error during date format migration: {e}")

    def verify_admin(self):
        if not self.api.current_user or self.api.current_user.get("role") != "Admin":
            raise Exception("Access Denied: Owner/Admin privileges required.")

    def login(self, username, password):
        try:
            username = username.strip().lower()
            password_hash = hashlib.sha256(password.strip().encode('utf-8')).hexdigest()
            
            conn = self.get_connection()
            cursor = conn.cursor()
            cursor.execute("""
                SELECT userID, username, role, employeeID 
                FROM User 
                WHERE LOWER(username) = ? AND passwordHash = ? AND isActive = 1
            """, (username, password_hash))
            row = cursor.fetchone()
            conn.close()
            
            if row:
                self.api.current_user = {
                    "userID": row[0],
                    "username": row[1],
                    "role": row[2],
                    "employeeID": row[3]
                }
                return {"status": "success", "message": "Logged in successfully!", "user": self.api.current_user}
            else:
                return {"status": "error", "message": "Invalid username or password."}
        except Exception as e:
            return {"status": "error", "message": f"Login failed: {e}"}

    def logout(self):
        self.api.current_user = None
        return {"status": "success", "message": "Logged out successfully!"}

    def reset_database(self):
        if not self.api.current_user or self.api.current_user.get("role") != "Developer":
            return {"status": "error", "message": "Access Denied: Developer privileges required."}
        
        try:
            import shutil
            # Back up database.db
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            backup_name = os.path.join(get_app_dir(), f"database_backup_{timestamp}.db")
            shutil.copy2(self.db_name, backup_name)
            
            conn = self.get_connection()
            cursor = conn.cursor()
            
            # Clean database entries
            cursor.execute("DELETE FROM Payment")
            cursor.execute("DELETE FROM LaundryOrder_Service")
            cursor.execute("DELETE FROM LaundryOrder_Addon")
            cursor.execute("DELETE FROM LaundryOrder")
            cursor.execute("DELETE FROM Customer")
            cursor.execute("DELETE FROM Employee")
            cursor.execute("DELETE FROM Service")
            cursor.execute("DELETE FROM Addon")
            
            cursor.execute("DELETE FROM sqlite_sequence WHERE name IN ('Customer', 'Employee', 'Service', 'Addon', 'LaundryOrder', 'Payment')")
            
            conn.commit()
            conn.close()
            
            return {
                "status": "success",
                "message": f"Database backed up to '{backup_name}' and successfully reset!"
            }
        except Exception as e:
            return {"status": "error", "message": f"Database reset failed: {str(e)}"}
