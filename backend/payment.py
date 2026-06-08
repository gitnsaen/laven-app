from datetime import datetime
from backend.base import format_to_friendly

class PaymentService:
    def __init__(self, api):
        self.api = api

    def add_payment(self, amount, method, order_id):
        valid_methods = ['Cash', 'G-Cash']
        if method not in valid_methods:
            return {"status": "error", "message": "Invalid payment method."}

        try:
            conn = self.api.base.get_connection()
            cursor = conn.cursor()
            
            cursor.execute("SELECT customerID FROM LaundryOrder WHERE LaundryOrderID = ?", (order_id,))
            cust_row = cursor.fetchone()
            if not cust_row:
                return {"status": "error", "message": "Order not found."}
            cust_id = cust_row[0]
            
            # Use ISO timestamp
            now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            cursor.execute('''
                INSERT INTO Payment (customerID, orderID, method, amount, paymentDate) 
                VALUES (?, ?, ?, ?, ?)
            ''', (cust_id, order_id, method, float(amount), now_str))
            
            conn.commit()
            conn.close()
            return {"status": "success", "message": f"Payment of ₱{amount} recorded for Order #{order_id}."}
        except Exception as e:
            return {"status": "error", "message": str(e)}

    def cancel_payment(self, payment_id):
        conn = None
        try:
            conn = self.api.base.get_connection()
            cursor = conn.cursor()
            cursor.execute("BEGIN TRANSACTION")

            cursor.execute("SELECT orderID, amount FROM Payment WHERE paymentID = ?", (payment_id,))
            row = cursor.fetchone()
            if not row:
                raise ValueError("Payment not found.")
            order_id = row[0]

            # Store updates using ISO format
            now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            cursor.execute("UPDATE Payment SET status = 'Cancelled', paymentDate = ? WHERE paymentID = ?", (now_str, payment_id))

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

            cursor.execute("UPDATE LaundryOrder SET paymentStatus = ? WHERE LaundryOrderID = ?", (new_pay_status, order_id))

            conn.commit()
            conn.close()
            return {"status": "success", "message": "Payment cancelled successfully.", "orderID": order_id}
        except Exception as e:
            if conn:
                conn.rollback()
                conn.close()
            return {"status": "error", "message": str(e)}

    def get_payments_for_order(self, order_id):
        try:
            conn = self.api.base.get_connection()
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
                    "paymentDate": format_to_friendly(r[5])
                })
            
            conn.close()
            return rows
        except Exception as e:
            return []
