from datetime import datetime
from backend.base import format_to_friendly

class OrderService:
    def __init__(self, api):
        self.api = api

    def get_all_orders(self):
        try:
            conn = self.api.base.get_connection()
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
                    "datePlaced": format_to_friendly(row[1]),
                    "dateClaimed": format_to_friendly(row[2]) if row[2] else '-',
                    "status": row[3],
                    "paymentStatus": row[4],
                    "customerName": row[5],
                    "contactNum": row[6],
                    "employeeName": row[7],
                    "amount": float(row[8] or 0)
                })

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
                
                # Build summary string (services only)
                summary_parts = []
                for s in services:
                    summary_parts.append(f"{s[1]}kg {s[0]}")
                
                order['summary'] = ", ".join(summary_parts) if summary_parts else "Laundry Order"
                if not order['paymentStatus']:
                    order['paymentStatus'] = 'Unpaid'

            conn.close()
            return orders
        except Exception as e:
            print(f"Error fetching orders: {e}")
            return []

    def get_order_form_data(self):
        try:
            conn = self.api.base.get_connection()
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
        conn = None
        try:
            conn = self.api.base.get_connection()
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
                    today = datetime.now().strftime("%Y-%m-%d")
                    cursor.execute("""
                        INSERT INTO Customer (customerName, contactNum, joinedDate)
                        VALUES (?, ?, ?)
                    """, (order_data['customerName'], order_data['contactNum'], today))
                    customer_id = cursor.lastrowid

            amount_due = float(order_data.get('amountDue', 0))
            amount_paid = float(order_data.get('amountPaid', 0))
            payment_method = order_data.get('paymentMethod', 'Cash')

            if amount_paid >= amount_due and amount_due > 0:
                pay_status = 'Paid'
            elif amount_paid > 0:
                pay_status = 'Partially Paid'
            else:
                pay_status = 'Unpaid'

            # Store in ISO format
            now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

            # 2. Insert LaundryOrder
            cursor.execute("""
                INSERT INTO LaundryOrder (
                    customerID, employeeID, datePlaced, LaundryOrderStatus, paymentStatus
                ) VALUES (?, ?, ?, 'Pending', ?)
            """, (customer_id, order_data.get('employeeId', 1), now_str, pay_status))
            order_id = cursor.lastrowid

            # 3. Insert LaundryOrder_Service
            service_ids = order_data.get('serviceIds', [])
            load = int(order_data.get('load', 1))
            
            if not service_ids and order_data.get('serviceId'):
                service_ids = [order_data.get('serviceId')]

            for sid in service_ids:
                if sid:
                    cursor.execute("""
                        INSERT INTO LaundryOrder_Service (LaundryOrderID, serviceID, quantity)
                        VALUES (?, ?, ?)
                    """, (order_id, sid, load))

            # 4. Insert LaundryOrder_Addon
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

    def update_order_status(self, order_id, new_status):
        valid_statuses = ['Pending', 'On Progress', 'Done', 'Claimed', 'Cancelled']
        if new_status not in valid_statuses:
            return {"status": "error", "message": f"Invalid status: {new_status}"}
        try:
            conn = self.api.base.get_connection()
            cursor = conn.cursor()
            cursor.execute("UPDATE LaundryOrder SET LaundryOrderStatus = ? WHERE LaundryOrderID = ?", (new_status, order_id))
            conn.commit()
            conn.close()
            return {"status": "success", "message": f"Order #{order_id} marked as {new_status}."}
        except Exception as e:
            return {"status": "error", "message": str(e)}

    def get_order_details(self, order_id):
        try:
            conn = self.api.base.get_connection()
            cursor = conn.cursor()

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
                "datePlaced": format_to_friendly(row[3]),
                "dateClaimed": format_to_friendly(row[4]) if row[4] else '-',
                "LaundryOrderStatus": row[5],
                "paymentStatus": row[6],
                "customerName": row[7],
                "contactNum": row[8],
                "employeeName": row[9],
                "paymentMethod": row[10],
                "amount": float(row[11] or 0)
            }

            cursor.execute("SELECT COALESCE(SUM(amount), 0) AS totalPaid FROM Payment WHERE orderID = ? AND status = 'Completed'", (order_id,))
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
        valid_statuses = ['Pending', 'On Progress', 'Done', 'Claimed', 'Cancelled']
        if new_status and new_status not in valid_statuses:
            return {"status": "error", "message": f"Invalid status: {new_status}"}
        conn = None
        try:
            conn = self.api.base.get_connection()
            cursor = conn.cursor()
            cursor.execute("BEGIN TRANSACTION")

            cursor.execute("SELECT LaundryOrderStatus FROM LaundryOrder WHERE LaundryOrderID = ?", (order_id,))
            order_row = cursor.fetchone()
            old_status = order_row[0] if order_row else None

            # Store updates using ISO format
            now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            if new_status:
                cursor.execute("UPDATE LaundryOrder SET LaundryOrderStatus = ? WHERE LaundryOrderID = ?",
                               (new_status, order_id))
                if new_status == 'Claimed':
                    cursor.execute("UPDATE LaundryOrder SET dateClaimed = ? WHERE LaundryOrderID = ?",
                                   (now_str, order_id))
                elif old_status == 'Claimed' and new_status != 'Claimed':
                    cursor.execute("UPDATE LaundryOrder SET dateClaimed = NULL WHERE LaundryOrderID = ?",
                                   (order_id,))

                if new_status == 'Cancelled':
                    cursor.execute("UPDATE Payment SET status = 'Cancelled', paymentDate = ? WHERE orderID = ?",
                                   (now_str, order_id))
                    cursor.execute("UPDATE LaundryOrder SET paymentStatus = 'Unpaid' WHERE LaundryOrderID = ?",
                                   (order_id,))

            additional_payment = float(additional_payment or 0)
            if additional_payment > 0:
                method_to_use = payment_method if payment_method in ['Cash', 'G-Cash'] else 'Cash'
                
                cursor.execute("SELECT customerID FROM LaundryOrder WHERE LaundryOrderID = ?", (order_id,))
                cust_row = cursor.fetchone()
                cust_id = cust_row[0] if cust_row else 1
                
                cursor.execute("""
                    INSERT INTO Payment (customerID, orderID, method, amount, paymentDate)
                    VALUES (?, ?, ?, ?, ?)
                """, (cust_id, order_id, method_to_use, additional_payment, now_str))

                cursor.execute("SELECT COALESCE(SUM(amount), 0) FROM Payment WHERE orderID = ? AND status = 'Completed'", (order_id,))
                total_paid = cursor.fetchone()[0] or 0
                
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
