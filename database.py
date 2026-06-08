from backend.base import BaseService
from backend.customer import CustomerService
from backend.employee import EmployeeService
from backend.service import ServiceModule
from backend.order import OrderService
from backend.payment import PaymentService
from backend.dashboard import DashboardService

class DatabaseAPI:
    def __init__(self):
        self.current_user = None  # Holds currently logged in user info
        self.base = BaseService(self)
        self.customers_service = CustomerService(self)
        self.employees_service = EmployeeService(self)
        self.services_service = ServiceModule(self)
        self.orders_service = OrderService(self)
        self.payments_service = PaymentService(self)
        self.dashboard_service = DashboardService(self)

    def get_connection(self):
        return self.base.get_connection()

    def verify_admin(self):
        self.base.verify_admin()

    def login(self, username, password):
        return self.base.login(username, password)

    def logout(self):
        return self.base.logout()

    def get_current_user(self):
        return self.current_user

    def reset_database(self):
        return self.base.reset_database()

    # Customer
    def add_customer(self, name, contact):
        return self.customers_service.add_customer(name, contact)

    def check_customer_duplicate(self, name, phone, ignore_id=None):
        return self.customers_service.check_customer_duplicate(name, phone, ignore_id)

    def get_customers(self):
        return self.customers_service.get_customers()

    def get_customer(self, customer_id):
        return self.customers_service.get_customer(customer_id)

    def update_customer(self, customer_id, name, contact):
        return self.customers_service.update_customer(customer_id, name, contact)

    def delete_customer(self, customer_id):
        return self.customers_service.delete_customer(customer_id)

    # Employee
    def add_employee(self, fname, mid, lname, contact):
        return self.employees_service.add_employee(fname, mid, lname, contact)

    def check_employee_duplicate(self, fname, lname, phone, ignore_id=None):
        return self.employees_service.check_employee_duplicate(fname, lname, phone, ignore_id)

    def get_employees(self):
        return self.employees_service.get_employees()

    def update_employee(self, employee_id, fname, mid, lname, contact):
        return self.employees_service.update_employee(employee_id, fname, mid, lname, contact)

    def delete_employee(self, employee_id):
        return self.employees_service.delete_employee(employee_id)

    # Service
    def add_service(self, name, price):
        return self.services_service.add_service(name, price)

    def get_services(self):
        return self.services_service.get_services()

    def update_service(self, service_id, name, price):
        return self.services_service.update_service(service_id, name, price)

    def delete_service(self, service_id):
        return self.services_service.delete_service(service_id)

    # Addon
    def add_addon(self, name, price):
        return self.services_service.add_addon(name, price)

    def get_addons(self):
        return self.services_service.get_addons()

    def update_addon(self, addon_id, name, price):
        return self.services_service.update_addon(addon_id, name, price)

    def delete_addon(self, addon_id):
        return self.services_service.delete_addon(addon_id)

    # Orders
    def get_all_orders(self):
        return self.orders_service.get_all_orders()

    def get_order_form_data(self):
        return self.orders_service.get_order_form_data()

    def create_order(self, order_data):
        return self.orders_service.create_order(order_data)

    def record_payment(self, order_id, amount_paid, payment_method):
        return self.update_order_status_and_payment(order_id, None, amount_paid, payment_method)

    def update_order_status(self, order_id, new_status):
        return self.orders_service.update_order_status(order_id, new_status)

    def get_order_details(self, order_id):
        return self.orders_service.get_order_details(order_id)

    def update_order_status_and_payment(self, order_id, new_status, additional_payment, payment_method='Cash'):
        return self.orders_service.update_order_status_and_payment(order_id, new_status, additional_payment, payment_method)

    # Payment
    def add_payment(self, amount, method, order_id):
        return self.payments_service.add_payment(amount, method, order_id)

    def cancel_payment(self, payment_id):
        return self.payments_service.cancel_payment(payment_id)

    def get_payments_for_order(self, order_id):
        return self.payments_service.get_payments_for_order(order_id)

    # Reports / Analytics
    def get_revenue_data(self, timeframe='Today'):
        return self.dashboard_service.get_revenue_data(timeframe)

    def get_dashboard_data(self):
        return self.dashboard_service.get_dashboard_data()

    def get_dashboard_revenue(self, timeframe='Today'):
        return self.dashboard_service.get_dashboard_revenue(timeframe)

    def get_dashboard_unpaid(self, timeframe='Today'):
        return self.dashboard_service.get_dashboard_unpaid(timeframe)

    def get_dashboard_customers(self, timeframe='Today'):
        return self.dashboard_service.get_dashboard_customers(timeframe)
