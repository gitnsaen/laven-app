CREATE TABLE Customer(
     customerID INTEGER PRIMARY KEY AUTOINCREMENT, 
     customerName TEXT NOT NULL, 
     contactNum TEXT NOT NULL,
     joinedDate TEXT DEFAULT (date('now', 'localtime')) NOT NULL,
     isActive INTEGER DEFAULT 1
);

CREATE TABLE Employee(
     employeeID INTEGER PRIMARY KEY AUTOINCREMENT, 
     firstName TEXT NOT NULL, 
     midInit TEXT,
     lastName TEXT NOT NULL,
     contactNum TEXT NOT NULL,
     joinedDate TEXT DEFAULT (date('now', 'localtime')) NOT NULL,
     isActive INTEGER DEFAULT 1
);

CREATE TABLE Service(
     serviceID INTEGER PRIMARY KEY AUTOINCREMENT, 
     serviceName TEXT NOT NULL, 
     price REAL NOT NULL
);

CREATE TABLE Addon(
     addonID INTEGER PRIMARY KEY AUTOINCREMENT, 
     addonName TEXT NOT NULL, 
     price REAL NOT NULL
);

CREATE TABLE LaundryOrder(
     LaundryOrderID INTEGER PRIMARY KEY AUTOINCREMENT,
     customerID INTEGER NOT NULL,
     employeeID INTEGER NOT NULL,
     datePlaced TEXT DEFAULT (datetime('now', 'localtime')) NOT NULL,
     dateClaimed TEXT, 
     LaundryOrderStatus TEXT CHECK(LaundryOrderStatus IN ('Pending', 'On Progress', 'Done', 'Claimed', 'Cancelled')) NOT NULL DEFAULT 'Pending',
     paymentStatus TEXT CHECK(paymentStatus IN ('Paid', 'Unpaid', 'Partially Paid')) NOT NULL DEFAULT 'Unpaid',
     FOREIGN KEY (customerID) REFERENCES Customer(customerID) ON DELETE CASCADE ON UPDATE CASCADE,
     FOREIGN KEY (employeeID) REFERENCES Employee(employeeID) ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE Payment (
    paymentID INTEGER PRIMARY KEY AUTOINCREMENT,
    customerID INTEGER NOT NULL,
    orderID INTEGER NOT NULL,
    method TEXT CHECK(method IN ('Cash', 'G-Cash')) NOT NULL,  
    amount REAL NOT NULL,
    paymentDate TEXT DEFAULT (datetime('now', 'localtime')) NOT NULL, 
    status TEXT CHECK(status IN ('Completed', 'Cancelled')) NOT NULL DEFAULT 'Completed',
    
    FOREIGN KEY (customerID) REFERENCES Customer(customerID),
    FOREIGN KEY (orderID) REFERENCES LaundryOrder(LaundryOrderID) ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE LaundryOrder_Service(
     orderServiceID INTEGER PRIMARY KEY AUTOINCREMENT,
     LaundryOrderID INTEGER NOT NULL,
     serviceID INTEGER NOT NULL, 
     quantity INTEGER NOT NULL,
     FOREIGN KEY (LaundryOrderID) REFERENCES LaundryOrder(LaundryOrderID) ON DELETE CASCADE,
     FOREIGN KEY (serviceID) REFERENCES Service(serviceID) ON DELETE CASCADE
);

CREATE TABLE LaundryOrder_Addon(
     orderAddonID INTEGER PRIMARY KEY AUTOINCREMENT,
     LaundryOrderID INTEGER NOT NULL,
     addonID INTEGER NOT NULL, 
     quantity INTEGER NOT NULL,
     FOREIGN KEY (LaundryOrderID) REFERENCES LaundryOrder(LaundryOrderID) ON DELETE CASCADE,
     FOREIGN KEY (addonID) REFERENCES Addon(addonID) ON DELETE CASCADE
);

CREATE TABLE User(
     userID INTEGER PRIMARY KEY AUTOINCREMENT,
     username TEXT UNIQUE NOT NULL,
     passwordHash TEXT NOT NULL,
     role TEXT CHECK(role IN ('Admin', 'Staff', 'Developer')) NOT NULL DEFAULT 'Staff',
     employeeID INTEGER,
     isActive INTEGER DEFAULT 1,
     FOREIGN KEY (employeeID) REFERENCES Employee(employeeID) ON DELETE SET NULL
);