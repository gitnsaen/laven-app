from datetime import datetime
from backend.base import format_to_friendly

class EmployeeService:
    def __init__(self, api):
        self.api = api

    def add_employee(self, fname, mid, lname, contact):
        try:
            self.api.base.verify_admin()
            if not fname or not lname or not contact:
                return {"status": "error", "message": "First Name, Last Name, and Contact Number cannot be empty."}
            if any(char.isdigit() for char in fname) or any(char.isdigit() for char in lname):
                return {"status": "error", "message": "Employee name should not contain numbers."}
            if mid and any(char.isdigit() for char in mid):
                return {"status": "error", "message": "Middle initial should not contain numbers."}
            clean_contact = contact.replace(" ", "").replace("-", "")
            if not clean_contact.startswith("09") or len(clean_contact) != 11 or not clean_contact.isdigit():
                return {"status": "error", "message": "Contact number must follow the format 09xxxxxxxx."}

            today = datetime.now().strftime("%Y-%m-%d")
            conn = self.api.base.get_connection()
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
            conn = self.api.base.get_connection()
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
                    "joinedDate": format_to_friendly(row[5])
                })
            conn.close()
            return rows
        except Exception as e:
            print(f"Error fetching employees: {e}")
            return []

    def update_employee(self, employee_id, fname, mid, lname, contact):
        try:
            self.api.base.verify_admin()
            if not fname or not lname or not contact:
                return {"status": "error", "message": "First Name, Last Name, and Contact Number cannot be empty."}
            if any(char.isdigit() for char in fname) or any(char.isdigit() for char in lname):
                return {"status": "error", "message": "Employee name should not contain numbers."}
            if mid and any(char.isdigit() for char in mid):
                return {"status": "error", "message": "Middle initial should not contain numbers."}
            clean_contact = contact.replace(" ", "").replace("-", "")
            if not clean_contact.startswith("09") or len(clean_contact) != 11 or not clean_contact.isdigit():
                return {"status": "error", "message": "Contact number must follow the format 09xxxxxxxx."}

            conn = self.api.base.get_connection()
            cursor = conn.cursor()
            cursor.execute("UPDATE Employee SET firstName = ?, midInit = ?, lastName = ?, contactNum = ? WHERE employeeID = ?", (fname, mid, lname, contact, employee_id))
            conn.commit()
            conn.close()
            return {"status": "success", "message": f"Employee {employee_id} updated successfully!"}
        except Exception as e:
            return {"status": "error", "message": str(e)}

    def delete_employee(self, employee_id):
        try:
            self.api.base.verify_admin()
            conn = self.api.base.get_connection()
            cursor = conn.cursor()
            cursor.execute("UPDATE Employee SET isActive = 0 WHERE employeeID = ?", (employee_id,))
            conn.commit()
            conn.close()
            return {"status": "success", "message": f"Employee {employee_id} archived successfully!"}
        except Exception as e:
            return {"status": "error", "message": str(e)}

    def check_employee_duplicate(self, fname, lname, phone, ignore_id=None):
        try:
            conn = self.api.base.get_connection()
            cursor = conn.cursor()
            
            name_match = False
            phone_match = False
            
            query_name = "SELECT employeeID FROM Employee WHERE firstName = ? COLLATE NOCASE AND lastName = ? COLLATE NOCASE AND isActive = 1"
            params_name = [fname, lname]
            if ignore_id is not None and ignore_id != "":
                query_name += " AND employeeID != ?"
                params_name.append(int(ignore_id))
            cursor.execute(query_name, params_name)
            if cursor.fetchone():
                name_match = True
                
            clean_phone = phone.replace(" ", "").replace("-", "") if phone else ""
            query_phone = "SELECT employeeID FROM Employee WHERE REPLACE(REPLACE(contactNum, ' ', ''), '-', '') = ? AND isActive = 1"
            params_phone = [clean_phone]
            if ignore_id is not None and ignore_id != "":
                query_phone += " AND employeeID != ?"
                params_phone.append(int(ignore_id))
            cursor.execute(query_phone, params_phone)
            if cursor.fetchone():
                phone_match = True
                
            conn.close()
            return {"status": "success", "name_match": name_match, "phone_match": phone_match}
        except Exception as e:
            return {"status": "error", "message": str(e)}
