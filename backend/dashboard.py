from datetime import datetime, timedelta
from backend.base import format_to_friendly

class DashboardService:
    def __init__(self, api):
        self.api = api

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

    def _get_date_filter_clause(self, timeframe, column_name):
        now = datetime.now()
        tf = timeframe.strip().lower()
        if tf == 'today':
            start = now.replace(hour=0, minute=0, second=0, microsecond=0)
            return f"{column_name} >= ?", (start.strftime("%Y-%m-%d %H:%M:%S"),)
        elif tf == 'yesterday':
            start = (now - timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)
            end = start.replace(hour=23, minute=59, second=59)
            return f"{column_name} >= ? AND {column_name} <= ?", (start.strftime("%Y-%m-%d %H:%M:%S"), end.strftime("%Y-%m-%d %H:%M:%S"))
        elif tf in ('last 7 days', 'last 7 day'):
            start = (now - timedelta(days=7)).replace(hour=0, minute=0, second=0, microsecond=0)
            return f"{column_name} >= ?", (start.strftime("%Y-%m-%d %H:%M:%S"),)
        elif tf == 'this month':
            start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
            return f"{column_name} >= ?", (start.strftime("%Y-%m-%d %H:%M:%S"),)
        elif tf in ('last 30 days', 'last 30 day'):
            start = (now - timedelta(days=30)).replace(hour=0, minute=0, second=0, microsecond=0)
            return f"{column_name} >= ?", (start.strftime("%Y-%m-%d %H:%M:%S"),)
        elif tf in ('last 1 year', 'last 1 years', 'this year', '1 year'):
            start = (now - timedelta(days=365)).replace(hour=0, minute=0, second=0, microsecond=0)
            return f"{column_name} >= ?", (start.strftime("%Y-%m-%d %H:%M:%S"),)
        return "1=1", ()

    def _get_date_filter_clause_date_only(self, timeframe, column_name):
        now = datetime.now()
        tf = timeframe.strip().lower()
        if tf == 'today':
            start = now.strftime("%Y-%m-%d")
            return f"{column_name} >= ?", (start,)
        elif tf == 'yesterday':
            start = (now - timedelta(days=1)).strftime("%Y-%m-%d")
            end = start
            return f"{column_name} >= ? AND {column_name} <= ?", (start, end)
        elif tf in ('last 7 days', 'last 7 day'):
            start = (now - timedelta(days=7)).strftime("%Y-%m-%d")
            return f"{column_name} >= ?", (start,)
        elif tf == 'this month':
            start = now.replace(day=1).strftime("%Y-%m-%d")
            return f"{column_name} >= ?", (start,)
        elif tf in ('last 30 days', 'last 30 day'):
            start = (now - timedelta(days=30)).strftime("%Y-%m-%d")
            return f"{column_name} >= ?", (start,)
        elif tf in ('last 1 year', 'last 1 years', 'this year', '1 year'):
            start = (now - timedelta(days=365)).strftime("%Y-%m-%d")
            return f"{column_name} >= ?", (start,)
        return "1=1", ()

    def get_revenue_data(self, timeframe='Today'):
        try:
            conn = self.api.base.get_connection()
            cursor = conn.cursor()
            
            pay_clause, pay_params = self._get_date_filter_clause(timeframe, "p.paymentDate")
            order_clause, order_params = self._get_date_filter_clause(timeframe, "o.datePlaced")
            
            query = f"""
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
                    (SELECT COALESCE(SUM(amount), 0) FROM Payment p2 WHERE p2.orderID = o.LaundryOrderID AND p2.status = 'Completed') as orderTotalPaid,
                    o.datePlaced as orderDate,
                    p.status as paymentStatus
                FROM Payment p
                JOIN LaundryOrder o ON p.orderID = o.LaundryOrderID
                WHERE {pay_clause}
                
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
                    o.datePlaced as orderDate,
                    'Completed' as paymentStatus
                FROM LaundryOrder o
                WHERE NOT EXISTS (SELECT 1 FROM Payment p WHERE p.orderID = o.LaundryOrderID)
                  AND {order_clause}
                  
                ORDER BY date DESC
            """
            
            cursor.execute(query, pay_params + order_params)
            rows = cursor.fetchall()
            payments = []
            
            for row in rows:
                payments.append({
                    "paymentID": row[0],
                    "orderID": row[1],
                    "date": format_to_friendly(row[2]),
                    "method": row[3],
                    "amountPaid": float(row[4] or 0),
                    "status": row[5],
                    "orderProgressStatus": row[6],
                    "orderTotal": float(row[7] or 0),
                    "orderTotalPaid": float(row[8] or 0),
                    "balance": max(0, float(row[7] or 0) - float(row[8] or 0)),
                    "paymentStatus": row[10]
                })

            total_collected = sum(p['amountPaid'] for p in payments if p['orderProgressStatus'] != 'Cancelled' and p['paymentStatus'] != 'Cancelled')
            unpaid_balances = sum(p['balance'] for p in payments if p['status'] != 'Paid' and p['orderProgressStatus'] != 'Cancelled')
            total_cash = sum(p['amountPaid'] for p in payments if p['method'] == 'Cash' and p['orderProgressStatus'] != 'Cancelled' and p['paymentStatus'] != 'Cancelled')
            total_gcash = sum(p['amountPaid'] for p in payments if p['method'] == 'G-Cash' and p['orderProgressStatus'] != 'Cancelled' and p['paymentStatus'] != 'Cancelled')
            
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
            conn = self.api.base.get_connection()
            cursor = conn.cursor()
            
            # 1. Fetch Recent Orders (Limit 15)
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
                    "date": format_to_friendly(r[1]),
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
            today_str = datetime.now().strftime("%Y-%m-%d")
            cursor.execute('''
                SELECT SUM(p.amount) 
                FROM Payment p
                JOIN LaundryOrder o ON p.orderID = o.LaundryOrderID
                WHERE p.paymentDate LIKE ? AND o.LaundryOrderStatus != 'Cancelled' AND p.status = 'Completed'
            ''', (f"{today_str}%",))
            revenue = cursor.fetchone()[0] or 0

            # 4. Unpaid Total Today
            cursor.execute('''
                SELECT SUM(
                    COALESCE((SELECT SUM(s.price * os.quantity) FROM LaundryOrder_Service os JOIN Service s ON os.serviceID = s.serviceID WHERE os.LaundryOrderID = o.LaundryOrderID), 0) +
                    COALESCE((SELECT SUM(a.price * oa.quantity) FROM LaundryOrder_Addon oa JOIN Addon a ON oa.addonID = a.addonID WHERE oa.LaundryOrderID = o.LaundryOrderID), 0)
                    - 
                    COALESCE((SELECT SUM(p.amount) FROM Payment p WHERE p.orderID = o.LaundryOrderID AND p.status = 'Completed'), 0)
                )
                FROM LaundryOrder o
                WHERE o.datePlaced LIKE ? AND o.paymentStatus != 'Paid' AND o.LaundryOrderStatus != 'Cancelled'
            ''', (f"{today_str}%",))
            unpaid_val = cursor.fetchone()[0] or 0

            # 5. Customer Split
            cursor.execute("SELECT COUNT(*) FROM Customer WHERE joinedDate = ? AND isActive = 1", (today_str,))
            new_customers = cursor.fetchone()[0]
            
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
            return {"recentOrders": [], "stats": {}}

    def get_dashboard_revenue(self, timeframe='Today'):
        try:
            clause, params = self._get_date_filter_clause(timeframe, "p.paymentDate")
            conn = self.api.base.get_connection()
            cursor = conn.cursor()
            cursor.execute(f'''
                SELECT COALESCE(SUM(p.amount), 0.0)
                FROM Payment p
                JOIN LaundryOrder o ON p.orderID = o.LaundryOrderID
                WHERE o.LaundryOrderStatus != 'Cancelled' AND p.status = 'Completed' AND {clause}
            ''', params)
            total_revenue = float(cursor.fetchone()[0] or 0)
            conn.close()
            return {"status": "success", "value": total_revenue}
        except Exception as e:
            print(f"Error in get_dashboard_revenue: {e}")
            return {"status": "error", "message": str(e), "value": 0.0}

    def get_dashboard_unpaid(self, timeframe='Today'):
        try:
            clause, params = self._get_date_filter_clause(timeframe, "o.datePlaced")
            conn = self.api.base.get_connection()
            cursor = conn.cursor()
            cursor.execute(f'''
                SELECT COALESCE(SUM(
                    COALESCE((SELECT SUM(s.price * os.quantity) FROM LaundryOrder_Service os JOIN Service s ON os.serviceID = s.serviceID WHERE os.LaundryOrderID = o.LaundryOrderID), 0) +
                    COALESCE((SELECT SUM(a.price * oa.quantity) FROM LaundryOrder_Addon oa JOIN Addon a ON oa.addonID = a.addonID WHERE oa.LaundryOrderID = o.LaundryOrderID), 0)
                    - 
                    COALESCE((SELECT SUM(p.amount) FROM Payment p WHERE p.orderID = o.LaundryOrderID AND p.status = 'Completed'), 0)
                ), 0.0)
                FROM LaundryOrder o
                WHERE o.paymentStatus != 'Paid' AND o.LaundryOrderStatus != 'Cancelled' AND {clause}
            ''', params)
            total_unpaid = float(cursor.fetchone()[0] or 0)
            conn.close()
            return {"status": "success", "value": total_unpaid}
        except Exception as e:
            print(f"Error in get_dashboard_unpaid: {e}")
            return {"status": "error", "message": str(e), "value": 0.0}

    def get_dashboard_customers(self, timeframe='Today'):
        try:
            conn = self.api.base.get_connection()
            cursor = conn.cursor()
            
            # New Customers
            new_clause, new_params = self._get_date_filter_clause_date_only(timeframe, "joinedDate")
            cursor.execute(f"SELECT COUNT(*) FROM Customer WHERE isActive = 1 AND {new_clause}", new_params)
            new_customers_count = cursor.fetchone()[0]
            
            # Returning Customers
            order_clause, order_params = self._get_date_filter_clause(timeframe, "o.datePlaced")
            start_date, _ = self._parse_timeframe(timeframe)
            if start_date:
                start_date_str = start_date.strftime("%Y-%m-%d")
            else:
                start_date_str = "1970-01-01"
                
            cursor.execute(f'''
                SELECT COUNT(DISTINCT o.customerID)
                FROM LaundryOrder o
                JOIN Customer c ON o.customerID = c.customerID
                WHERE o.LaundryOrderStatus != 'Cancelled' AND c.isActive = 1
                  AND {order_clause}
                  AND c.joinedDate < ?
            ''', order_params + (start_date_str,))
            returning_customers_count = cursor.fetchone()[0]
            
            conn.close()
            return {
                "status": "success",
                "newCustomers": new_customers_count,
                "returningCustomers": returning_customers_count
            }
        except Exception as e:
            print(f"Error in get_dashboard_customers: {e}")
            return {"status": "error", "message": str(e), "newCustomers": 0, "returningCustomers": 0}
