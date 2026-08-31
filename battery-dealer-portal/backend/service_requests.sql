USE battery_dealer_portal;

CREATE TABLE IF NOT EXISTS service_requests (
  id INT AUTO_INCREMENT PRIMARY KEY,
  request_number VARCHAR(50) NOT NULL UNIQUE,
  dealer_id INT NOT NULL,
  dealer_user_id INT NOT NULL,
  related_order_id INT NULL,
  request_type VARCHAR(50) NOT NULL,
  battery_serial_number VARCHAR(100) NOT NULL,
  priority ENUM('LOW', 'NORMAL', 'HIGH', 'URGENT')
    NOT NULL DEFAULT 'NORMAL',
  description TEXT NOT NULL,
  status ENUM(
    'OPEN',
    'IN_PROGRESS',
    'WAITING_FOR_CUSTOMER',
    'RESOLVED',
    'CLOSED'
  ) NOT NULL DEFAULT 'OPEN',
  salesforce_case_id VARCHAR(18) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_service_request_dealer
    FOREIGN KEY (dealer_id) REFERENCES dealers(id),
  CONSTRAINT fk_service_request_user
    FOREIGN KEY (dealer_user_id) REFERENCES dealer_users(id),
  CONSTRAINT fk_service_request_order
    FOREIGN KEY (related_order_id) REFERENCES dealer_orders(id)
    ON DELETE SET NULL
);
