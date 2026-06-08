class ServiceModule:
    def __init__(self, api):
        self.api = api

    def add_service(self, name, price):
        try:
            self.api.base.verify_admin()
            conn = self.api.base.get_connection()
            cursor = conn.cursor()
            cursor.execute("INSERT INTO Service (serviceName, price) VALUES (?, ?)", (name, float(price)))
            conn.commit()
            conn.close()
            return {"status": "success", "message": f"Service {name} added successfully!"}
        except Exception as e:
            return {"status": "error", "message": str(e)}

    def get_services(self):
        try:
            conn = self.api.base.get_connection()
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
            self.api.base.verify_admin()
            conn = self.api.base.get_connection()
            cursor = conn.cursor()
            cursor.execute("UPDATE Service SET serviceName = ?, price = ? WHERE serviceID = ?", (name, float(price), service_id))
            conn.commit()
            conn.close()
            return {"status": "success", "message": f"Service {service_id} updated successfully!"}
        except Exception as e:
            return {"status": "error", "message": str(e)}

    def delete_service(self, service_id):
        try:
            self.api.base.verify_admin()
            conn = self.api.base.get_connection()
            cursor = conn.cursor()
            cursor.execute("DELETE FROM Service WHERE serviceID = ?", (service_id,))
            conn.commit()
            conn.close()
            return {"status": "success", "message": f"Service {service_id} deleted successfully!"}
        except Exception as e:
            return {"status": "error", "message": str(e)}

    def add_addon(self, name, price):
        try:
            self.api.base.verify_admin()
            conn = self.api.base.get_connection()
            cursor = conn.cursor()
            cursor.execute("INSERT INTO Addon (addonName, price) VALUES (?, ?)", (name, float(price)))
            conn.commit()
            conn.close()
            return {"status": "success", "message": f"Addon {name} added successfully!"}
        except Exception as e:
            return {"status": "error", "message": str(e)}

    def get_addons(self):
        try:
            conn = self.api.base.get_connection()
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
            self.api.base.verify_admin()
            conn = self.api.base.get_connection()
            cursor = conn.cursor()
            cursor.execute("UPDATE Addon SET addonName = ?, price = ? WHERE addonID = ?", (name, float(price), addon_id))
            conn.commit()
            conn.close()
            return {"status": "success", "message": f"Addon {addon_id} updated successfully!"}
        except Exception as e:
            return {"status": "error", "message": str(e)}

    def delete_addon(self, addon_id):
        try:
            self.api.base.verify_admin()
            conn = self.api.base.get_connection()
            cursor = conn.cursor()
            cursor.execute("DELETE FROM Addon WHERE addonID = ?", (addon_id,))
            conn.commit()
            conn.close()
            return {"status": "success", "message": f"Addon {addon_id} deleted successfully!"}
        except Exception as e:
            return {"status": "error", "message": str(e)}
