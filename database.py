import os
import sqlite3
import hashlib
import sys
import platform
from datetime import datetime, timedelta

def get_resource_path(relative_path):
    """ Resolves paths for both development and PyInstaller bundled states """
    try:
        base_path = sys._MEIPASS
    except AttributeError:
        base_path = os.path.dirname(os.path.abspath(__file__))
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

class DatabaseAPI:
    def __init__(self):
        self.db_name = os.path.join(get_app_dir(), 'database.db')
        self.current_user = None  # Holds currently logged in user info
        self.init_db()

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

        # Ensure User table exists and is seeded (Backward-compatibility migration)
        try:
            conn = sqlite3.connect(self.db_name)
            cursor = conn.cursor()
            
            # Check if User table exists
            cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='User'")
            table_exists = cursor.fetchone()
            
            if table_exists:
                # Check if Developer role is supported in check constraint of User table schema
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
                    print("Migration completed successfully!")
            
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
            
            # Seed default roles if empty
            cursor.execute("SELECT COUNT(*) FROM User")
            if cursor.fetchone()[0] == 0:
                admin_hash = hashlib.sha256("admin123".encode('utf-8')).hexdigest()
                staff_hash = hashlib.sha256("staff123".encode('utf-8')).hexdigest()
                cursor.execute("INSERT INTO User (username, passwordHash, role) VALUES ('admin', ?, 'Admin')", (admin_hash,))
                cursor.execute("INSERT INTO User (username, passwordHash, role) VALUES ('staff', ?, 'Staff')", (staff_hash,))
                conn.commit()
                print("Default roles successfully seeded!")
            
            # Ensure developer user exists
            cursor.execute("SELECT COUNT(*) FROM User WHERE username = 'developer'")
            if cursor.fetchone()[0] == 0:
                dev_hash = hashlib.sha256("developer123".encode('utf-8')).hexdigest()
                cursor.execute("INSERT INTO User (username, passwordHash, role) VALUES ('developer', ?, 'Developer')", (dev_hash,))
                conn.commit()
                print("Developer user successfully seeded!")
                
            conn.close()
        except Exception as e:
            print(f"Migration error: {e}")


    def get_connection(self):
        # check_same_thread=False is required for pywebview multi-threaded environment
        conn = sqlite3.connect(self.db_name, check_same_thread=False)
        return conn

    def verify_admin(self):
        if not self.current_user or self.current_user.get("role") != "Admin":
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
                self.current_user = {
                    "userID": row[0],
                    "username": row[1],
                    "role": row[2],
                    "employeeID": row[3]
                }
                return {"status": "success", "message": "Logged in successfully!", "user": self.current_user}
            else:
                return {"status": "error", "message": "Invalid username or password."}
        except Exception as e:
            return {"status": "error", "message": f"Login failed: {e}"}

    def logout(self):
        self.current_user = None
        return {"status": "success", "message": "Logged out successfully!"}

    def get_current_user(self):
        return self.current_user

    def reset_database(self):
        if not self.current_user or self.current_user.get("role") != "Developer":
            return {"status": "error", "message": "Access Denied: Developer privileges required."}
        
        try:
            import shutil
            # 1. Back up database.db
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            backup_name = os.path.join(get_app_dir(), f"database_backup_{timestamp}.db")
            shutil.copy2(self.db_name, backup_name)
            
            # 2. Clean database entries
            conn = self.get_connection()
            cursor = conn.cursor()
            
            # Delete transaction & master data from all tables except User
            cursor.execute("DELETE FROM Payment")
            cursor.execute("DELETE FROM LaundryOrder_Service")
            cursor.execute("DELETE FROM LaundryOrder_Addon")
            cursor.execute("DELETE FROM LaundryOrder")
            cursor.execute("DELETE FROM Customer")
            cursor.execute("DELETE FROM Employee")
            cursor.execute("DELETE FROM Service")
            cursor.execute("DELETE FROM Addon")
            
            # Reset SQLite sequences
            cursor.execute("DELETE FROM sqlite_sequence WHERE name IN ('Customer', 'Employee', 'Service', 'Addon', 'LaundryOrder', 'Payment')")
            
            conn.commit()
            conn.close()
            
            return {
                "status": "success",
                "message": f"Database backed up to '{backup_name}' and successfully reset!"
            }
        except Exception as e:
            return {"status": "error", "message": f"Database reset failed: {str(e)}"}

#for customer
    def add_customer(self, name, contact):
        try:
            # Backend strict validation
            if not name or not contact:
                return {"status": "error", "message": "Customer Name and Contact Number cannot be empty."}
            if any(char.isdigit() for char in name):
                return {"status": "error", "message": "Customer Name should not contain numbers."}
            clean_contact = contact.replace(" ", "").replace("-", "")
            if not clean_contact.startswith("09") or len(clean_contact) != 11 or not clean_contact.isdigit():
                return {"status": "error", "message": "Contact number must follow the format 09xxxxxxxx."}

            conn = self.get_connection()
            cursor = conn.cursor()
            
            # Check if exists
            cursor.execute("SELECT customerID FROM Customer WHERE customerName = ? AND contactNum = ?", (name, contact))
            if cursor.fetchone():
                conn.close()
                return {"status": "error", "message": "Customer already exists with this name and contact number."}

            today = datetime.now().strftime("%b %d, %Y")
            cursor.execute("""
                INSERT INTO Customer (customerName, contactNum, joinedDate)
                VALUES (?, ?, ?)
            """, (name, contact, today))
            conn.commit()
            conn.close()
            return {"status": "success", "message": f"Customer {name} added successfully!"}
        except Exception as e:
            return {"status": "error", "message": str(e)}

    def get_customers(self):
        try:
            conn = self.get_connection()
            cursor = conn.cursor()
            # Grab lastOrderDate using MAX() to determine activity status
            cursor.execute("""
                SELECT 
                    c.customerID, c.customerName, c.contactNum, c.joinedDate,
                    COUNT(o.LaundryOrderID) AS totalOrders,
                    MAX(o.datePlaced) AS lastOrderDate
                FROM Customer c
                LEFT JOIN LaundryOrder o ON c.customerID = o.customerID
                WHERE c.isActive = 1
                GROUP BY c.customerID
                ORDER BY c.customerID DESC
            """)
            
            rows = []
            for row in cursor.fetchall():
                rows.append({
                    "customerID": row[0],
                    "customerName": row[1],
                    "contactNum": row[2],
                    "joinedDate": row[3],
                    "totalOrders": row[4],
                    "lastOrderDate": row[5]
                })
            conn.close()

            now = datetime.now()
            
            for customer in rows:
                # Parse "Oct 25, 2023" format back into a datetime object for comparison
                joined_dt = datetime.strptime(customer['joinedDate'], "%b %d, %Y")
                days_since_joined = (now - joined_dt).days
                
                # Logic for "New" status (joined within last 15 days)
                if days_since_joined <= 15:
                    customer['status'] = "New"
                else:
                    # Logic for "Inactive"
                    is_inactive = False
                    if customer['totalOrders'] == 0:
                        is_inactive = True
                    elif customer['lastOrderDate']:
                        # We try parsing common date formats found in the system
                        try:
                            # Try database format if stored as ISO
                            last_order_dt = datetime.strptime(customer['lastOrderDate'], "%Y-%m-%d %H:%M:%S")
                        except ValueError:
                            try:
                                # Try the formatted display date
                                last_order_dt = datetime.strptime(customer['lastOrderDate'], "%b %d, %Y")
                            except ValueError:
                                last_order_dt = joined_dt # Fallback to joined date
                        
                        days_since_last_order = (now - last_order_dt).days
                        if days_since_last_order > 15:
                            is_inactive = True
                    
                    customer['status'] = "Inactive" if is_inactive else "Active"

            return rows
        except Exception as e:
            print(f"Error fetching customers with dynamic status: {e}")
            return []

    def get_customer(self, customer_id):
        try:
            conn = self.get_connection()
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM Customer WHERE customerID = ?", (customer_id,))
            row = cursor.fetchone()
            conn.close()
            if not row: return None
            return {
                "customerID": row[0],
                "customerName": row[1],
                "contactNum": row[2],
                "joinedDate": row[3]
            }
        except Exception as e:
            print(f"Error fetching customer {customer_id}: {e}")
            return None

    def update_customer(self, customer_id, name, contact):
        try:
            # Backend strict validation
            if not name or not contact:
                return {"status": "error", "message": "Customer Name and Contact Number cannot be empty."}
            if any(char.isdigit() for char in name):
                return {"status": "error", "message": "Customer Name should not contain numbers."}
            clean_contact = contact.replace(" ", "").replace("-", "")
            if not clean_contact.startswith("09") or len(clean_contact) != 11 or not clean_contact.isdigit():
                return {"status": "error", "message": "Contact number must follow the format 09xxxxxxxx."}

            conn = self.get_connection()
            cursor = conn.cursor()
            cursor.execute("UPDATE Customer SET customerName = ?, contactNum = ? WHERE customerID = ?", (name, contact, customer_id))
            conn.commit()
            conn.close()
            return {"status": "success", "message": f"Customer {customer_id} updated successfully!"}
        except Exception as e:
            return {"status": "error", "message": str(e)}

    def delete_customer(self, customer_id):
        try:
            conn = self.get_connection()
            cursor = conn.cursor()
            cursor.execute("UPDATE Customer SET isActive = 0 WHERE customerID = ?", (customer_id,))
            conn.commit()
            conn.close()
            return {"status": "success", "message": f"Customer {customer_id} archived successfully!"}
        except Exception as e:
            return {"status": "error", "message": str(e)}

#for employee
    def add_employee(self, fname, mid, lname, contact):
        try:
            self.verify_admin()
            # Backend strict validation
            if not fname or not lname or not contact:
                return {"status": "error", "message": "First Name, Last Name, and Contact Number cannot be empty."}
            if any(char.isdigit() for char in fname) or any(char.isdigit() for char in lname):
                return {"status": "error", "message": "Employee name should not contain numbers."}
            if mid and any(char.isdigit() for char in mid):
                return {"status": "error", "message": "Middle initial should not contain numbers."}
            clean_contact = contact.replace(" ", "").replace("-", "")
            if not clean_contact.startswith("09") or len(clean_contact) != 11 or not clean_contact.isdigit():
                return {"status": "error", "message": "Contact number must follow the format 09xxxxxxxx."}

            today = datetime.now().strftime("%b %d, %Y")
            conn = self.get_connection()
            cursor = conn.cursor()
            cursor.execute("""
                INSERT INTO Employee (firstName, midInit, lastName, contactNum, joinedDate)
                VALUES (?, ?, ?, ?, ?)
            """, (fname, mid, lname, contact, today))
            conn.commit()
            conn.close()
            return {"status": "success", "message": f"Employee {fname} added successfully!"}
        except Exception as e:
            return {"status": "error", "message": str(e)}

    def get_employees(self):
        try:
            conn = self.get_connection()
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM Employee WHERE isActive = 1 ORDER BY employeeID DESC")
            rows = []
            for row in cursor.fetchall():
                rows.append({
                    "employeeID": row[0],
                    "firstName": row[1],
                    "midInit": row[2],
                    "lastName": row[3],
                    "contactNum": row[4],
                    "joinedDate": row[5]
                })
            conn.close()
            return rows
        except Exception as e:
            print(f"Error fetching employees: {e}")
            return []

    def update_employee(self, employee_id, fname, mid, lname, contact):
        try:
            self.verify_admin()
            # Backend strict validation
            if not fname or not lname or not contact:
                return {"status": "error", "message": "First Name, Last Name, and Contact Number cannot be empty."}
            if any(char.isdigit() for char in fname) or any(char.isdigit() for char in lname):
                return {"status": "error", "message": "Employee name should not contain numbers."}
            if mid and any(char.isdigit() for char in mid):
                return {"status": "error", "message": "Middle initial should not contain numbers."}
            clean_contact = contact.replace(" ", "").replace("-", "")
            if not clean_contact.startswith("09") or len(clean_contact) != 11 or not clean_contact.isdigit():
                return {"status": "error", "message": "Contact number must follow the format 09xxxxxxxx."}

            conn = self.get_connection()
            cursor = conn.cursor()
            cursor.execute("UPDATE Employee SET firstName = ?, midInit = ?, lastName = ?, contactNum = ? WHERE employeeID = ?", (fname, mid, lname, contact, employee_id))
            conn.commit()
            conn.close()
            return {"status": "success", "message": f"Employee {employee_id} updated successfully!"}
        except Exception as e:
            return {"status": "error", "message": str(e)}

    def delete_employee(self, employee_id):
        try:
            self.verify_admin()
            conn = self.get_connection()
            cursor = conn.cursor()
            cursor.execute("UPDATE Employee SET isActive = 0 WHERE employeeID = ?", (employee_id,))
            conn.commit()
            conn.close()
            return {"status": "success", "message": f"Employee {employee_id} archived successfully!"}
        except Exception as e:
            return {"status": "error", "message": str(e)}

#for service
    def add_service(self, name, price):
        try:
            self.verify_admin()
            conn = self.get_connection()
            cursor = conn.cursor()
            cursor.execute("INSERT INTO Service (serviceName, price) VALUES (?, ?)", (name, float(price)))
            conn.commit()
            conn.close()
            return {"status": "success", "message": f"Service {name} added successfully!"}
        except Exception as e:
            return {"status": "error", "message": str(e)}

    def get_services(self):
        try:
            conn = self.get_connection()
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM Service")
            rows = []
            for row in cursor.fetchall():
                rows.append({
                    "serviceID": row[0],
                    "serviceName": row[1],
                    "price": float(row[2] or 0)
                })
            conn.close()
            return rows
        except Exception as e:
            print(f"Error fetching services: {e}")
            return []

    def update_service(self, service_id, name, price):
        try:
            self.verify_admin()
            conn = self.get_connection()
            cursor = conn.cursor()
            cursor.execute("UPDATE Service SET serviceName = ?, price = ? WHERE serviceID = ?", (name, float(price), service_id))
            conn.commit()
            conn.close()
            return {"status": "success", "message": f"Service {service_id} updated successfully!"}
        except Exception as e:
            return {"status": "error", "message": str(e)}

    def delete_service(self, service_id):
        try:
            self.verify_admin()
            conn = self.get_connection()
            cursor = conn.cursor()
            cursor.execute("DELETE FROM Service WHERE serviceID = ?", (service_id,))
            conn.commit()
            conn.close()
            return {"status": "success", "message": f"Service {service_id} deleted successfully!"}
        except Exception as e:
            return {"status": "error", "message": str(e)}

#for addon
    def add_addon(self, name, price):
        try:
            self.verify_admin()
            conn = self.get_connection()
            cursor = conn.cursor()
            cursor.execute("INSERT INTO Addon (addonName, price) VALUES (?, ?)", (name, float(price)))
            conn.commit()
            conn.close()
            return {"status": "success", "message": f"Addon {name} added successfully!"}
        except Exception as e:
            return {"status": "error", "message": str(e)}

    def get_addons(self):
        try:
            conn = self.get_connection()
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM Addon")
            rows = []
            for row in cursor.fetchall():
                rows.append({
                    "addonID": row[0],
                    "addonName": row[1],
                    "price": float(row[2] or 0)
                })
            conn.close()
            return rows
        except Exception as e:
            print(f"Error fetching addons: {e}")
            return []

    def update_addon(self, addon_id, name, price):
        try:
            self.verify_admin()
            conn = self.get_connection()
            cursor = conn.cursor()
            cursor.execute("UPDATE Addon SET addonName = ?, price = ? WHERE addonID = ?", (name, float(price), addon_id))
            conn.commit()
            conn.close()
            return {"status": "success", "message": f"Addon {addon_id} updated successfully!"}
        except Exception as e:
            return {"status": "error", "message": str(e)}

    def delete_addon(self, addon_id):
        try:
            self.verify_admin()
            conn = self.get_connection()
            cursor = conn.cursor()
            cursor.execute("DELETE FROM Addon WHERE addonID = ?", (addon_id,))
            conn.commit()
            conn.close()
            return {"status": "success", "message": f"Addon {addon_id} deleted successfully!"}
        except Exception as e:
            return {"status": "error", "message": str(e)}


    def get_all_orders(self):
        try:
            conn = self.get_connection()
            cursor = conn.cursor()
            cursor.execute('''
                SELECT 
                    o.LaundryOrderID as orderID, 
                    o.datePlaced, 
                    o.dateClaimed, 
                    o.LaundryOrderStatus as status,
                    o.paymentStatus,
                    c.customerName, 
                    c.contactNum,
                    e.firstName || ' ' || e.lastName AS employeeName,
                    COALESCE((
                        SELECT SUM(s.price * os.quantity) 
                        FROM LaundryOrder_Service os 
                        JOIN Service s ON os.serviceID = s.serviceID 
                        WHERE os.LaundryOrderID = o.LaundryOrderID
                    ), 0) +
                    COALESCE((
                        SELECT SUM(a.price * oa.quantity) 
                        FROM LaundryOrder_Addon oa 
                        JOIN Addon a ON oa.addonID = a.addonID 
                        WHERE oa.LaundryOrderID = o.LaundryOrderID
                    ), 0) AS amount
                FROM LaundryOrder o
                JOIN Customer c ON o.customerID = c.customerID
                JOIN Employee e ON o.employeeID = e.employeeID
                ORDER BY o.LaundryOrderID DESC
            ''')
            rows = cursor.fetchall()
            orders = []
            for row in rows:
                orders.append({
                    "orderID": row[0],
                    "datePlaced": row[1],
                    "dateClaimed": row[2],
                    "status": row[3],
                    "paymentStatus": row[4],
                    "customerName": row[5],
                    "contactNum": row[6],
                    "employeeName": row[7],
                    "amount": float(row[8] or 0)
                })

            # 2. For each order, get a summary of items
            for order in orders:
                order_id = order['orderID']
                
                # Get services
                cursor.execute('''
                    SELECT s.serviceName, os.quantity 
                    FROM LaundryOrder_Service os
                    JOIN Service s ON os.serviceID = s.serviceID
                    WHERE os.LaundryOrderID = ?
                ''', (order_id,))
                services = cursor.fetchall()
                
                # Get addons
                cursor.execute('''
                    SELECT a.addonName, oa.quantity 
                    FROM LaundryOrder_Addon oa
                    JOIN Addon a ON oa.addonID = a.addonID
                    WHERE oa.LaundryOrderID = ?
                ''', (order_id,))
                addons = cursor.fetchall()
                
                # Build summary string (services only, no addons)
                summary_parts = []
                for s in services:
                    summary_parts.append(f"{s[1]}kg {s[0]}")
                
                order['summary'] = ", ".join(summary_parts) if summary_parts else "Laundry Order"
                
                # Ensure values match the exact display logic (e.g., Unpaid vs Partial)
                if not order['paymentStatus']:
                    order['paymentStatus'] = 'Unpaid'

            conn.close()
            return orders
        except Exception as e:
            print(f"Error fetching orders: {e}")
            return []

    def get_order_form_data(self):
        """Returns all active services, addons, employees, and next order ID for the Add Order form."""
        try:
            conn = self.get_connection()
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM Service")
            services = []
            for r in cursor.fetchall():
                services.append({"serviceID": r[0], "serviceName": r[1], "price": float(r[2] or 0)})
                
            cursor.execute("SELECT * FROM Addon")
            addons = []
            for r in cursor.fetchall():
                addons.append({"addonID": r[0], "addonName": r[1], "price": float(r[2] or 0)})
                
            cursor.execute("SELECT * FROM Employee WHERE isActive = 1 ORDER BY employeeID DESC")
            employees = []
            for r in cursor.fetchall():
                employees.append({
                    "employeeID": r[0], 
                    "firstName": r[1], 
                    "midInit": r[2], 
                    "lastName": r[3]
                })
                
            cursor.execute("SELECT COALESCE(MAX(LaundryOrderID), 0) + 1 AS nextId FROM LaundryOrder")
            next_order_id = cursor.fetchone()[0] or 1
            conn.close()
            return {"services": services, "addons": addons, "employees": employees, "nextOrderId": next_order_id}
        except Exception as e:
            print(f"Error fetching order form data: {e}")
            return {"services": [], "addons": [], "employees": [], "nextOrderId": 1}

    def create_order(self, order_data):
        """Transactional order creation: LaundryOrder + bridge tables + Payment record."""
        conn = None
        try:
            conn = self.get_connection()
            cursor = conn.cursor()
            cursor.execute("BEGIN TRANSACTION")

            # 1. Resolve or create customer
            customer_id = order_data.get('customer_id')
            if not customer_id:
                # Deduplication: Check if customer exists by name and contact
                cursor.execute("SELECT customerID FROM Customer WHERE customerName = ? AND contactNum = ?", 
                               (order_data['customerName'], order_data['contactNum']))
                row = cursor.fetchone()
                if row:
                    customer_id = row[0]
                else:
                    today = datetime.now().strftime("%b %d, %Y")
                    cursor.execute("""
                        INSERT INTO Customer (customerName, contactNum, joinedDate)
                        VALUES (?, ?, ?)
                    """, (order_data['customerName'], order_data['contactNum'], today))
                    customer_id = cursor.lastrowid

            amount_due = float(order_data.get('amountDue', 0))
            amount_paid = float(order_data.get('amountPaid', 0))
            payment_method = order_data.get('paymentMethod', 'Cash')

            # Determine payment status from amounts
            if amount_paid >= amount_due and amount_due > 0:
                pay_status = 'Paid'
            elif amount_paid > 0:
                pay_status = 'Partially Paid'
            else:
                pay_status = 'Unpaid'

            now_str = datetime.now().strftime("%b %d, %Y %I:%M %p")

            # 2. Insert LaundryOrder
            cursor.execute("""
                INSERT INTO LaundryOrder (
                    customerID, employeeID, datePlaced, LaundryOrderStatus, paymentStatus
                ) VALUES (?, ?, ?, 'Pending', ?)
            """, (customer_id, order_data.get('employeeId', 1), now_str, pay_status))
            order_id = cursor.lastrowid

            # 3. Insert into LaundryOrder_Service bridge table
            service_ids = order_data.get('serviceIds', [])
            load = int(order_data.get('load', 1))
            
            # Legacy support for single serviceId
            if not service_ids and order_data.get('serviceId'):
                service_ids = [order_data.get('serviceId')]

            for sid in service_ids:
                if sid:
                    cursor.execute("""
                        INSERT INTO LaundryOrder_Service (LaundryOrderID, serviceID, quantity)
                        VALUES (?, ?, ?)
                    """, (order_id, sid, load))

            # 4. Insert into LaundryOrder_Addon bridge table
            addons = order_data.get('addons', {})
            for addon_id_str, addon_info in addons.items():
                qty = addon_info.get('quantity', 0) if isinstance(addon_info, dict) else int(addon_info)
                if qty > 0:
                    cursor.execute("""
                        INSERT INTO LaundryOrder_Addon (LaundryOrderID, addonID, quantity)
                        VALUES (?, ?, ?)
                    """, (order_id, int(addon_id_str), qty))

            # 5. Record initial payment if amount_paid > 0
            if amount_paid > 0:
                cursor.execute("""
                    INSERT INTO Payment (customerID, orderID, method, amount, paymentDate)
                    VALUES (?, ?, ?, ?, ?)
                """, (customer_id, order_id, payment_method if payment_method in ('Cash', 'G-Cash') else 'Cash', amount_paid, now_str))

            conn.commit()
            conn.close()
            return {"status": "success", "message": f"Order #{order_id} created successfully!", "orderID": order_id}

        except Exception as e:
            if conn:
                conn.rollback()
                conn.close()
            return {"status": "error", "message": f"Failed to create order: {str(e)}"}

    def record_payment(self, order_id, amount_paid, payment_method):
        return self.update_order_status_and_payment(order_id, None, amount_paid, payment_method)

    def update_order_status(self, order_id, new_status):
        valid_statuses = ['Pending', 'On Progress', 'Done', 'Claimed', 'Cancelled']
        if new_status not in valid_statuses:
            return {"status": "error", "message": f"Invalid status: {new_status}"}
        try:
            conn = self.get_connection()
            cursor = conn.cursor()
            cursor.execute("UPDATE LaundryOrder SET LaundryOrderStatus = ? WHERE LaundryOrderID = ?", (new_status, order_id))
            conn.commit()
            conn.close()
            return {"status": "success", "message": f"Order #{order_id} marked as {new_status}."}
        except Exception as e:
            return {"status": "error", "message": str(e)}

    def get_order_details(self, order_id):
        """Fetches full order details including total paid from Payment table."""
        try:
            conn = self.get_connection()
            cursor = conn.cursor()

            # Main order + customer info
            cursor.execute("""
                SELECT 
                    o.LaundryOrderID, o.customerID, o.employeeID, o.datePlaced, o.dateClaimed, 
                    o.LaundryOrderStatus, o.paymentStatus,
                    c.customerName, c.contactNum,
                    e.firstName || ' ' || e.lastName AS employeeName,
                    COALESCE((SELECT method FROM Payment WHERE orderID = o.LaundryOrderID ORDER BY paymentID DESC LIMIT 1), 'Cash') as paymentMethod,
                    COALESCE((
                        SELECT SUM(s.price * os.quantity) 
                        FROM LaundryOrder_Service os 
                        JOIN Service s ON os.serviceID = s.serviceID 
                        WHERE os.LaundryOrderID = o.LaundryOrderID
                    ), 0) +
                    COALESCE((
                        SELECT SUM(a.price * oa.quantity) 
                        FROM LaundryOrder_Addon oa 
                        JOIN Addon a ON oa.addonID = a.addonID 
                        WHERE oa.LaundryOrderID = o.LaundryOrderID
                    ), 0) AS calculatedAmount
                FROM LaundryOrder o
                JOIN Customer c ON o.customerID = c.customerID
                JOIN Employee e ON o.employeeID = e.employeeID
                WHERE o.LaundryOrderID = ?
            """, (order_id,))
            row = cursor.fetchone()
            if not row:
                conn.close()
                return None
            
            order = {
                "LaundryOrderID": row[0],
                "customerID": row[1],
                "employeeID": row[2],
                "datePlaced": row[3],
                "dateClaimed": row[4],
                "LaundryOrderStatus": row[5],
                "paymentStatus": row[6],
                "customerName": row[7],
                "contactNum": row[8],
                "employeeName": row[9],
                "paymentMethod": row[10],
                "amount": float(row[11] or 0)
            }

            # Sum all payments recorded for this order
            cursor.execute("SELECT COALESCE(SUM(amount), 0) AS totalPaid FROM Payment WHERE orderID = ?", (order_id,))
            total_paid_row = cursor.fetchone()
            total_paid = float(total_paid_row[0] if total_paid_row else 0)
            
            order['totalPaid'] = total_paid
            order['balance'] = max(0, order['amount'] - total_paid)

            # Fetch service items
            cursor.execute("""
                SELECT s.serviceName, s.price, os.quantity
                FROM LaundryOrder_Service os
                JOIN Service s ON os.serviceID = s.serviceID
                WHERE os.LaundryOrderID = ?
            """, (order_id,))
            order['services'] = []
            for r in cursor.fetchall():
                order['services'].append({
                    "serviceName": r[0],
                    "price": float(r[1] or 0),
                    "quantity": float(r[2] or 0)
                })

            # Fetch addon items
            cursor.execute("""
                SELECT a.addonName, a.price, oa.quantity
                FROM LaundryOrder_Addon oa
                JOIN Addon a ON oa.addonID = a.addonID
                WHERE oa.LaundryOrderID = ?
            """, (order_id,))
            order['addons'] = []
            for r in cursor.fetchall():
                order['addons'].append({
                    "addonName": r[0],
                    "price": float(r[1] or 0),
                    "quantity": float(r[2] or 0)
                })

            conn.close()
            return order
        except Exception as e:
            print(f"Error fetching order details: {e}")
            return None

    def update_order_status_and_payment(self, order_id, new_status, additional_payment, payment_method='Cash'):
        """Atomically updates order status and logs a new payment if additional_payment > 0."""
        valid_statuses = ['Pending', 'On Progress', 'Done', 'Claimed', 'Cancelled']
        if new_status and new_status not in valid_statuses:
            return {"status": "error", "message": f"Invalid status: {new_status}"}
        conn = None
        try:
            conn = self.get_connection()
            cursor = conn.cursor()
            cursor.execute("BEGIN TRANSACTION")

            # 1. Update status if provided
            now_str = datetime.now().strftime("%b %d, %Y %I:%M %p")
            if new_status:
                cursor.execute("UPDATE LaundryOrder SET LaundryOrderStatus = ? WHERE LaundryOrderID = ?",
                               (new_status, order_id))
                # Auto-set dateClaimed when order is claimed
                if new_status == 'Claimed':
                    cursor.execute("UPDATE LaundryOrder SET dateClaimed = ? WHERE LaundryOrderID = ?",
                                   (now_str, order_id))

            # 2. Record additional payment if > 0
            additional_payment = float(additional_payment or 0)
            if additional_payment > 0:
                method_to_use = payment_method if payment_method in ['Cash', 'G-Cash'] else 'Cash'
                
                # We need customerID to insert into Payment
                cursor.execute("SELECT customerID FROM LaundryOrder WHERE LaundryOrderID = ?", (order_id,))
                cust_row = cursor.fetchone()
                cust_id = cust_row[0] if cust_row else 1
                
                cursor.execute("""
                    INSERT INTO Payment (customerID, orderID, method, amount, paymentDate)
                    VALUES (?, ?, ?, ?, ?)
                """, (cust_id, order_id, method_to_use, additional_payment, now_str))

                # Recalculate total paid and update paymentStatus on order
                cursor.execute("SELECT COALESCE(SUM(amount), 0) FROM Payment WHERE orderID = ?", (order_id,))
                total_paid = cursor.fetchone()[0] or 0
                
                # Calculate amount_due dynamically
                cursor.execute("""
                    SELECT 
                        COALESCE((SELECT SUM(s.price * os.quantity) FROM LaundryOrder_Service os JOIN Service s ON os.serviceID = s.serviceID WHERE os.LaundryOrderID = o.LaundryOrderID), 0) +
                        COALESCE((SELECT SUM(a.price * oa.quantity) FROM LaundryOrder_Addon oa JOIN Addon a ON oa.addonID = a.addonID WHERE oa.LaundryOrderID = o.LaundryOrderID), 0)
                    FROM LaundryOrder o WHERE o.LaundryOrderID = ?
                """, (order_id,))
                amount_due = cursor.fetchone()[0] or 0

                if total_paid >= amount_due and amount_due > 0:
                    new_pay_status = 'Paid'
                elif total_paid > 0:
                    new_pay_status = 'Partially Paid'
                else:
                    new_pay_status = 'Unpaid'
                cursor.execute("UPDATE LaundryOrder SET paymentStatus = ? WHERE LaundryOrderID = ?",
                               (new_pay_status, order_id))

            conn.commit()
            conn.close()
            return {"status": "success", "message": f"Order #{order_id} updated successfully."}
        except Exception as e:
            if conn:
                conn.rollback()
                conn.close()
            return {"status": "error", "message": str(e)}

#for payment
    def add_payment(self, amount, method, order_id):
        valid_methods = ['Cash', 'G-Cash']
        
        if method not in valid_methods:
            return {"status": "error", "message": "Invalid payment method."}

        try:
            conn = self.get_connection()
            cursor = conn.cursor()
            
            # We need customerID to insert into Payment
            cursor.execute("SELECT customerID FROM LaundryOrder WHERE LaundryOrderID = ?", (order_id,))
            cust_row = cursor.fetchone()
            if not cust_row:
                return {"status": "error", "message": "Order not found."}
            cust_id = cust_row[0]
            
            now_str = datetime.now().strftime("%b %d, %Y %I:%M %p")
            cursor.execute('''
                INSERT INTO Payment (customerID, orderID, method, amount, paymentDate) 
                VALUES (?, ?, ?, ?, ?)
            ''', (cust_id, order_id, method, float(amount), now_str))
            
            conn.commit()
            conn.close()
            return {"status": "success", "message": f"Payment of ₱{amount} recorded for Order #{order_id}."}
        except Exception as e:
            return {"status": "error", "message": str(e)}

    def get_payments_for_order(self, order_id):
        try:
            conn = self.get_connection()
            cursor = conn.cursor()
            
            cursor.execute("SELECT paymentID, customerID, orderID, method, amount, paymentDate FROM Payment WHERE orderID = ?",(order_id,))
            rows = []
            for r in cursor.fetchall():
                rows.append({
                    "paymentID": r[0],
                    "customerID": r[1],
                    "orderID": r[2],
                    "method": r[3],
                    "amount": float(r[4] or 0),
                    "paymentDate": r[5]
                })
            
            conn.close()
            return rows
        except Exception as e:
            return []

    def get_revenue_data(self, timeframe='Today'):
        try:
            conn = self.get_connection()
            cursor = conn.cursor()
            
            # 1. Calculate date range
            now = datetime.now()
            start_date = None
            
            if timeframe == 'Today':
                start_date = now.replace(hour=0, minute=0, second=0, microsecond=0)
            elif timeframe == 'Yesterday':
                start_date = (now - timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)
                end_date = start_date.replace(hour=23, minute=59, second=59)
            elif timeframe == 'Last 7 Days':
                start_date = (now - timedelta(days=7)).replace(hour=0, minute=0, second=0, microsecond=0)
            elif timeframe == 'This Month':
                start_date = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
            
            # Fetch all payments + orders with NO payments (Unpaid)
            cursor.execute("""
                SELECT 
                    p.paymentID,
                    o.LaundryOrderID as orderID,
                    p.paymentDate as date,
                    p.method,
                    p.amount as amountPaid,
                    o.paymentStatus as status,
                    o.LaundryOrderStatus as orderProgressStatus,
                    COALESCE((
                        SELECT SUM(s.price * os.quantity) 
                        FROM LaundryOrder_Service os 
                        JOIN Service s ON os.serviceID = s.serviceID 
                        WHERE os.LaundryOrderID = o.LaundryOrderID
                    ), 0) +
                    COALESCE((
                        SELECT SUM(a.price * oa.quantity) 
                        FROM LaundryOrder_Addon oa 
                        JOIN Addon a ON oa.addonID = a.addonID 
                        WHERE oa.LaundryOrderID = o.LaundryOrderID
                    ), 0) AS orderTotal,
                    (SELECT COALESCE(SUM(amount), 0) FROM Payment p2 WHERE p2.orderID = o.LaundryOrderID) as orderTotalPaid,
                    o.datePlaced as orderDate
                FROM Payment p
                JOIN LaundryOrder o ON p.orderID = o.LaundryOrderID
                
                UNION ALL
                
                SELECT 
                    NULL as paymentID,
                    o.LaundryOrderID as orderID,
                    o.datePlaced as date,
                    'N/A' as method,
                    0 as amountPaid,
                    o.paymentStatus as status,
                    o.LaundryOrderStatus as orderProgressStatus,
                    COALESCE((
                        SELECT SUM(s.price * os.quantity) 
                        FROM LaundryOrder_Service os 
                        JOIN Service s ON os.serviceID = s.serviceID 
                        WHERE os.LaundryOrderID = o.LaundryOrderID
                    ), 0) +
                    COALESCE((
                        SELECT SUM(a.price * oa.quantity) 
                        FROM LaundryOrder_Addon oa 
                        JOIN Addon a ON oa.addonID = a.addonID 
                        WHERE oa.LaundryOrderID = o.LaundryOrderID
                    ), 0) AS orderTotal,
                    0 as orderTotalPaid,
                    o.datePlaced as orderDate
                FROM LaundryOrder o
                WHERE NOT EXISTS (SELECT 1 FROM Payment p WHERE p.orderID = o.LaundryOrderID)
                
                ORDER BY date DESC
            """)
            
            rows = cursor.fetchall()
            payments = []
            
            # Filtering in Python for reliability with the string date format
            for row in rows:
                p_date_str = row[2]
                p_date = None
                for fmt in ("%b %d, %Y %I:%M %p", "%Y-%m-%d %H:%M:%S", "%b %d, %Y"):
                    try:
                        p_date = datetime.strptime(p_date_str, fmt)
                        break
                    except ValueError:
                        continue
                
                if not p_date:
                    continue
                
                # Apply timeframe filter
                if start_date:
                    if timeframe == 'Yesterday':
                        if not (start_date <= p_date <= end_date): continue
                    else:
                        if p_date < start_date: continue

                payments.append({
                    "paymentID": row[0],
                    "orderID": row[1],
                    "date": p_date_str,
                    "method": row[3],
                    "amountPaid": float(row[4] or 0),
                    "status": row[5],
                    "orderProgressStatus": row[6],
                    "orderTotal": float(row[7] or 0),
                    "orderTotalPaid": float(row[8] or 0),
                    "balance": max(0, float(row[7] or 0) - float(row[8] or 0))
                })

            # Calculate filtered summary
            total_collected = sum(p['amountPaid'] for p in payments if p['orderProgressStatus'] != 'Cancelled')
            unpaid_balances = sum(p['balance'] for p in payments if p['status'] != 'Paid' and p['orderProgressStatus'] != 'Cancelled')
            total_cash = sum(p['amountPaid'] for p in payments if p['method'] == 'Cash' and p['orderProgressStatus'] != 'Cancelled')
            total_gcash = sum(p['amountPaid'] for p in payments if p['method'] == 'G-Cash' and p['orderProgressStatus'] != 'Cancelled')
            
            conn.close()
            
            return {
                "payments": payments,
                "summary": {
                    "totalCollected": total_collected,
                    "unpaidBalances": unpaid_balances,
                    "cash": total_cash,
                    "gcash": total_gcash
                }
            }
        except Exception as e:
            print(f"Error fetching revenue data: {e}")
            return {
                "payments": [],
                "summary": {
                    "totalCollected": 0,
                    "unpaidBalances": 0,
                    "cash": 0,
                    "gcash": 0
                }
            }
    def get_dashboard_data(self):
        try:
            conn = self.get_connection()
            cursor = conn.cursor()
            
            # 1. Fetch Recent Orders (Limit 15 for scrollable cards)
            cursor.execute('''
                SELECT 
                    o.LaundryOrderID, o.datePlaced, o.LaundryOrderStatus, o.paymentStatus,
                    c.customerName,
                    COALESCE((
                        SELECT SUM(s.price * os.quantity) 
                        FROM LaundryOrder_Service os 
                        JOIN Service s ON os.serviceID = s.serviceID 
                        WHERE os.LaundryOrderID = o.LaundryOrderID
                    ), 0) +
                    COALESCE((
                        SELECT SUM(a.price * oa.quantity) 
                        FROM LaundryOrder_Addon oa 
                        JOIN Addon a ON oa.addonID = a.addonID 
                        WHERE oa.LaundryOrderID = o.LaundryOrderID
                    ), 0) AS totalAmount
                FROM LaundryOrder o
                JOIN Customer c ON o.customerID = c.customerID
                WHERE o.LaundryOrderStatus != 'Cancelled'
                ORDER BY o.LaundryOrderID DESC
                LIMIT 15
            ''')
            
            order_rows = cursor.fetchall()
            recent_orders = []
            for r in order_rows:
                # Get services summary for the card
                cursor.execute('''
                    SELECT s.serviceName 
                    FROM LaundryOrder_Service os
                    JOIN Service s ON os.serviceID = s.serviceID
                    WHERE os.LaundryOrderID = ?
                ''', (r[0],))
                services = [s[0] for s in cursor.fetchall()]
                summary = ", ".join(services) if services else "Laundry Order"
                
                recent_orders.append({
                    "orderID": r[0],
                    "date": r[1],
                    "status": r[2],
                    "paymentStatus": r[3],
                    "customerName": r[4],
                    "amount": float(r[5] or 0),
                    "summary": summary
                })

            # 2. Status Counts
            cursor.execute("SELECT COUNT(*) FROM LaundryOrder WHERE LaundryOrderStatus = 'Pending'")
            pending = cursor.fetchone()[0]
            
            cursor.execute("SELECT COUNT(*) FROM LaundryOrder WHERE LaundryOrderStatus = 'On Progress'")
            progress = cursor.fetchone()[0]
            
            cursor.execute("SELECT COUNT(*) FROM LaundryOrder WHERE LaundryOrderStatus = 'Done'")
            ready = cursor.fetchone()[0]

            # 3. Revenue Today (Exclude Cancelled)
            today_str = datetime.now().strftime("%b %d, %Y")
            cursor.execute('''
                SELECT SUM(p.amount) 
                FROM Payment p
                JOIN LaundryOrder o ON p.orderID = o.LaundryOrderID
                WHERE p.paymentDate LIKE ? AND o.LaundryOrderStatus != 'Cancelled'
            ''', (f"{today_str}%",))
            revenue = cursor.fetchone()[0] or 0

            # 4. Unpaid Total (Today's unpaid orders total amount - Exclude Cancelled)
            # Find orders placed today that are NOT fully paid and NOT cancelled
            cursor.execute('''
                SELECT SUM(
                    COALESCE((SELECT SUM(s.price * os.quantity) FROM LaundryOrder_Service os JOIN Service s ON os.serviceID = s.serviceID WHERE os.LaundryOrderID = o.LaundryOrderID), 0) +
                    COALESCE((SELECT SUM(a.price * oa.quantity) FROM LaundryOrder_Addon oa JOIN Addon a ON oa.addonID = a.addonID WHERE oa.LaundryOrderID = o.LaundryOrderID), 0)
                    - 
                    COALESCE((SELECT SUM(p.amount) FROM Payment p WHERE p.orderID = o.LaundryOrderID), 0)
                )
                FROM LaundryOrder o
                WHERE o.datePlaced LIKE ? AND o.paymentStatus != 'Paid' AND o.LaundryOrderStatus != 'Cancelled'
            ''', (f"{today_str}%",))
            unpaid_val = cursor.fetchone()[0] or 0

            # 5. Customer Split (Returning vs New Today)
            cursor.execute("SELECT COUNT(*) FROM Customer WHERE joinedDate = ? AND isActive = 1", (today_str,))
            new_customers = cursor.fetchone()[0]
            
            # Returning customers = distinct customers who placed an order today but joined BEFORE today
            cursor.execute('''
                SELECT COUNT(DISTINCT o.customerID)
                FROM LaundryOrder o
                JOIN Customer c ON o.customerID = c.customerID
                WHERE o.datePlaced LIKE ? AND c.joinedDate != ? AND c.isActive = 1
            ''', (f"{today_str}%", today_str))
            returning_customers = cursor.fetchone()[0]

            conn.close()
            return {
                "recentOrders": recent_orders,
                "stats": {
                    "pending": pending,
                    "progress": progress,
                    "ready": ready,
                    "revenue": float(revenue),
                    "unpaid": float(unpaid_val),
                    "newCustomers": new_customers,
                    "returningCustomers": returning_customers
                }
            }
        except Exception as e:
            print(f"Error in get_dashboard_data: {e}")
            if conn: conn.close()
            return {"recentOrders": [], "stats": {}}

    def _parse_timeframe(self, timeframe):
        now = datetime.now()
        start_date = None
        end_date = None
        tf = timeframe.strip().lower()
        
        if tf == 'today':
            start_date = now.replace(hour=0, minute=0, second=0, microsecond=0)
        elif tf == 'yesterday':
            start_date = (now - timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)
            end_date = start_date.replace(hour=23, minute=59, second=59)
        elif tf in ('last 7 days', 'last 7 day'):
            start_date = (now - timedelta(days=7)).replace(hour=0, minute=0, second=0, microsecond=0)
        elif tf in ('last 30 days', 'last 30 day'):
            start_date = (now - timedelta(days=30)).replace(hour=0, minute=0, second=0, microsecond=0)
        elif tf in ('last 1 year', 'last 1 years', 'this year', '1 year'):
            start_date = (now - timedelta(days=365)).replace(hour=0, minute=0, second=0, microsecond=0)
        else:
            start_date = now.replace(hour=0, minute=0, second=0, microsecond=0)
            
        return start_date, end_date

    def _is_date_in_range(self, date_str, start_date, end_date):
        if not date_str:
            return False
        dt = None
        for fmt in ("%b %d, %Y %I:%M %p", "%Y-%m-%d %H:%M:%S", "%b %d, %Y"):
            try:
                dt = datetime.strptime(date_str, fmt)
                break
            except ValueError:
                continue
        if not dt:
            return False
        
        if start_date:
            if end_date:
                return start_date <= dt <= end_date
            else:
                return dt >= start_date
        return True

    def get_dashboard_revenue(self, timeframe='Today'):
        try:
            start_date, end_date = self._parse_timeframe(timeframe)
            conn = self.get_connection()
            cursor = conn.cursor()
            cursor.execute('''
                SELECT p.paymentDate, p.amount
                FROM Payment p
                JOIN LaundryOrder o ON p.orderID = o.LaundryOrderID
                WHERE o.LaundryOrderStatus != 'Cancelled'
            ''')
            rows = cursor.fetchall()
            conn.close()
            
            total_revenue = 0.0
            for r in rows:
                p_date_str = r[0]
                amount = float(r[1] or 0)
                if self._is_date_in_range(p_date_str, start_date, end_date):
                    total_revenue += amount
            return {"status": "success", "value": total_revenue}
        except Exception as e:
            print(f"Error in get_dashboard_revenue: {e}")
            return {"status": "error", "message": str(e), "value": 0.0}

    def get_dashboard_unpaid(self, timeframe='Today'):
        try:
            start_date, end_date = self._parse_timeframe(timeframe)
            conn = self.get_connection()
            cursor = conn.cursor()
            cursor.execute('''
                SELECT 
                    o.datePlaced,
                    (
                        COALESCE((SELECT SUM(s.price * os.quantity) FROM LaundryOrder_Service os JOIN Service s ON os.serviceID = s.serviceID WHERE os.LaundryOrderID = o.LaundryOrderID), 0) +
                        COALESCE((SELECT SUM(a.price * oa.quantity) FROM LaundryOrder_Addon oa JOIN Addon a ON oa.addonID = a.addonID WHERE oa.LaundryOrderID = o.LaundryOrderID), 0)
                    ) AS orderTotal,
                    COALESCE((SELECT SUM(p.amount) FROM Payment p WHERE p.orderID = o.LaundryOrderID), 0) AS totalPaid
                FROM LaundryOrder o
                WHERE o.paymentStatus != 'Paid' AND o.LaundryOrderStatus != 'Cancelled'
            ''')
            rows = cursor.fetchall()
            conn.close()
            
            total_unpaid = 0.0
            for r in rows:
                date_placed = r[0]
                order_total = float(r[1] or 0)
                total_paid = float(r[2] or 0)
                balance = max(0.0, order_total - total_paid)
                if self._is_date_in_range(date_placed, start_date, end_date):
                    total_unpaid += balance
            return {"status": "success", "value": total_unpaid}
        except Exception as e:
            print(f"Error in get_dashboard_unpaid: {e}")
            return {"status": "error", "message": str(e), "value": 0.0}

    def get_dashboard_customers(self, timeframe='Today'):
        try:
            start_date, end_date = self._parse_timeframe(timeframe)
            conn = self.get_connection()
            cursor = conn.cursor()
            
            cursor.execute("SELECT joinedDate FROM Customer WHERE isActive = 1")
            customer_rows = cursor.fetchall()
            
            new_customers_count = 0
            for r in customer_rows:
                joined_date = r[0]
                if self._is_date_in_range(joined_date, start_date, end_date):
                    new_customers_count += 1
                    
            cursor.execute('''
                SELECT DISTINCT o.customerID, o.datePlaced, c.joinedDate
                FROM LaundryOrder o
                JOIN Customer c ON o.customerID = c.customerID
                WHERE o.LaundryOrderStatus != 'Cancelled' AND c.isActive = 1
            ''')
            order_rows = cursor.fetchall()
            conn.close()
            
            returning_customers_set = set()
            for r in order_rows:
                customer_id = r[0]
                date_placed = r[1]
                joined_date = r[2]
                
                if self._is_date_in_range(date_placed, start_date, end_date):
                    joined_dt = None
                    for fmt in ("%b %d, %Y %I:%M %p", "%Y-%m-%d %H:%M:%S", "%b %d, %Y"):
                        try:
                            joined_dt = datetime.strptime(joined_date, fmt)
                            break
                        except ValueError:
                            continue
                    
                    if joined_dt and start_date:
                        if joined_dt < start_date:
                            returning_customers_set.add(customer_id)
            
            returning_customers_count = len(returning_customers_set)
            return {
                "status": "success",
                "newCustomers": new_customers_count,
                "returningCustomers": returning_customers_count
            }
        except Exception as e:
            print(f"Error in get_dashboard_customers: {e}")
            return {"status": "error", "message": str(e), "newCustomers": 0, "returningCustomers": 0}

