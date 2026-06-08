from datetime import datetime
from backend.base import format_to_friendly, parse_to_iso

class CustomerService:
    def __init__(self, api):
        self.api = api

    def add_customer(self, name, contact):
        try:
            if not name or not contact:
                return {"status": "error", "message": "Customer Name and Contact Number cannot be empty."}
            if any(char.isdigit() for char in name):
                return {"status": "error", "message": "Customer Name should not contain numbers."}
            clean_contact = contact.replace(" ", "").replace("-", "")
            if not clean_contact.startswith("09") or len(clean_contact) != 11 or not clean_contact.isdigit():
                return {"status": "error", "message": "Contact number must follow the format 09xxxxxxxx."}

            conn = self.api.base.get_connection()
            cursor = conn.cursor()
            
            # Check if exists
            cursor.execute("SELECT customerID FROM Customer WHERE customerName = ? AND contactNum = ?", (name, contact))
            if cursor.fetchone():
                conn.close()
                return {"status": "error", "message": "Customer already exists with this name and contact number."}

            today = datetime.now().strftime("%Y-%m-%d")
            cursor.execute("""
                INSERT INTO Customer (customerName, contactNum, joinedDate)
                VALUES (?, ?, ?)
            """, (name, contact, today))
            conn.commit()
            conn.close()
            return {"status": "success", "message": f"Customer {name} added successfully!"}
        except Exception as e:
            return {"status": "error", "message": str(e)}

    def check_customer_duplicate(self, name, phone, ignore_id=None):
        try:
            conn = self.api.base.get_connection()
            cursor = conn.cursor()
            
            name_match = False
            phone_match = False
            
            query_name = "SELECT customerID FROM Customer WHERE customerName = ? COLLATE NOCASE AND isActive = 1"
            params_name = [name]
            if ignore_id is not None and ignore_id != "":
                query_name += " AND customerID != ?"
                params_name.append(int(ignore_id))
            cursor.execute(query_name, params_name)
            if cursor.fetchone():
                name_match = True
                
            clean_phone = phone.replace(" ", "").replace("-", "") if phone else ""
            query_phone = "SELECT customerID FROM Customer WHERE REPLACE(REPLACE(contactNum, ' ', ''), '-', '') = ? AND isActive = 1"
            params_phone = [clean_phone]
            if ignore_id is not None and ignore_id != "":
                query_phone += " AND customerID != ?"
                params_phone.append(int(ignore_id))
            cursor.execute(query_phone, params_phone)
            if cursor.fetchone():
                phone_match = True
                
            conn.close()
            return {"status": "success", "name_match": name_match, "phone_match": phone_match}
        except Exception as e:
            return {"status": "error", "message": str(e)}

    def get_customers(self):
        try:
            conn = self.api.base.get_connection()
            cursor = conn.cursor()
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
                    "joinedDate": row[3],  # ISO format string: YYYY-MM-DD
                    "totalOrders": row[4],
                    "lastOrderDate": row[5] # ISO format string or None
                })
            conn.close()

            now = datetime.now()
            
            for customer in rows:
                # Parse ISO date safely
                joined_str = customer['joinedDate']
                try:
                    joined_dt = datetime.strptime(joined_str, "%Y-%m-%d")
                except ValueError:
                    try:
                        joined_dt = datetime.strptime(parse_to_iso(joined_str), "%Y-%m-%d")
                    except Exception:
                        joined_dt = now

                days_since_joined = (now - joined_dt).days
                
                if days_since_joined <= 15:
                    customer['status'] = "New"
                else:
                    is_inactive = False
                    if customer['totalOrders'] == 0:
                        is_inactive = True
                    elif customer['lastOrderDate']:
                        last_order_str = customer['lastOrderDate']
                        try:
                            last_order_dt = datetime.strptime(last_order_str, "%Y-%m-%d %H:%M:%S")
                        except ValueError:
                            try:
                                last_order_dt = datetime.strptime(last_order_str, "%Y-%m-%d")
                            except ValueError:
                                last_order_dt = joined_dt
                        
                        days_since_last_order = (now - last_order_dt).days
                        if days_since_last_order > 15:
                            is_inactive = True
                    
                    customer['status'] = "Inactive" if is_inactive else "Active"

                # Convert to friendly format for displaying in UI
                customer['joinedDate'] = format_to_friendly(customer['joinedDate'])
                if customer['lastOrderDate']:
                    customer['lastOrderDate'] = format_to_friendly(customer['lastOrderDate'])

            return rows
        except Exception as e:
            print(f"Error fetching customers: {e}")
            return []

    def get_customer(self, customer_id):
        try:
            conn = self.api.base.get_connection()
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM Customer WHERE customerID = ?", (customer_id,))
            row = cursor.fetchone()
            conn.close()
            if not row: return None
            return {
                "customerID": row[0],
                "customerName": row[1],
                "contactNum": row[2],
                "joinedDate": format_to_friendly(row[3])
            }
        except Exception as e:
            print(f"Error fetching customer {customer_id}: {e}")
            return None

    def update_customer(self, customer_id, name, contact):
        try:
            if not name or not contact:
                return {"status": "error", "message": "Customer Name and Contact Number cannot be empty."}
            if any(char.isdigit() for char in name):
                return {"status": "error", "message": "Customer Name should not contain numbers."}
            clean_contact = contact.replace(" ", "").replace("-", "")
            if not clean_contact.startswith("09") or len(clean_contact) != 11 or not clean_contact.isdigit():
                return {"status": "error", "message": "Contact number must follow the format 09xxxxxxxx."}

            conn = self.api.base.get_connection()
            cursor = conn.cursor()
            cursor.execute("UPDATE Customer SET customerName = ?, contactNum = ? WHERE customerID = ?", (name, contact, customer_id))
            conn.commit()
            conn.close()
            return {"status": "success", "message": f"Customer {customer_id} updated successfully!"}
        except Exception as e:
            return {"status": "error", "message": str(e)}

    def delete_customer(self, customer_id):
        try:
            conn = self.api.base.get_connection()
            cursor = conn.cursor()
            cursor.execute("UPDATE Customer SET isActive = 0 WHERE customerID = ?", (customer_id,))
            conn.commit()
            conn.close()
            return {"status": "success", "message": f"Customer {customer_id} archived successfully!"}
        except Exception as e:
            return {"status": "error", "message": str(e)}
