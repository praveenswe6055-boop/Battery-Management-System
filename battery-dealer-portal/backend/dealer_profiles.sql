USE battery_dealer_portal;

CREATE TABLE IF NOT EXISTS dealer_profiles (
  dealer_id INT PRIMARY KEY,
  gst_number VARCHAR(30) NULL,
  business_address TEXT NULL,
  city VARCHAR(80) NULL,
  state VARCHAR(80) NULL,
  pincode VARCHAR(10) NULL,
  dealer_type ENUM(
    'AUTHORIZED_DEALER',
    'DISTRIBUTOR',
    'SERVICE_PARTNER'
  ) NOT NULL DEFAULT 'AUTHORIZED_DEALER',
  credit_limit DECIMAL(14, 2) NOT NULL DEFAULT 0,
  available_credit DECIMAL(14, 2) NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_dealer_profile_dealer
    FOREIGN KEY (dealer_id) REFERENCES dealers(id)
    ON DELETE CASCADE
);

INSERT IGNORE INTO dealer_profiles (dealer_id)
SELECT id FROM dealers;
