const dotenv = require("dotenv");

dotenv.config();

const database = require("../config/database");

const products = [
  {
    code: "BAT-150TT",
    name: "VoltCore Tall Tubular Battery",
    category: "INVERTER",
    capacity: 150,
    voltage: 12,
    warranty: 48,
    price: 14500,
    stock: 18,
    image: "/images/batteries/home-inverter-battery.png",
  },
  {
    code: "BAT-180TT",
    name: "VoltCore Tall Tubular Battery",
    category: "INVERTER",
    capacity: 180,
    voltage: 12,
    warranty: 54,
    price: 17250,
    stock: 12,
    image: "/images/batteries/home-inverter-battery.png",
  },
  {
    code: "BAT-200INV",
    name: "VoltCore PowerMax Inverter Battery",
    category: "INVERTER",
    capacity: 200,
    voltage: 12,
    warranty: 60,
    price: 19800,
    stock: 8,
    image: "/images/batteries/home-inverter-battery.png",
  },
  {
    code: "BAT-100AUTO",
    name: "VoltCore DrivePro Vehicle Battery",
    category: "VEHICLE",
    capacity: 100,
    voltage: 12,
    warranty: 36,
    price: 11200,
    stock: 24,
    image: "/images/batteries/vehicle-battery.png",
  },
  {
    code: "BAT-120SOLAR",
    name: "VoltCore SolarMax Battery",
    category: "SOLAR",
    capacity: 120,
    voltage: 12,
    warranty: 48,
    price: 13750,
    stock: 15,
    image: "/images/batteries/solar-battery.png",
  },
  {
    code: "BAT-150SOLAR",
    name: "VoltCore SolarMax Battery",
    category: "SOLAR",
    capacity: 150,
    voltage: 12,
    warranty: 60,
    price: 16900,
    stock: 10,
    image: "/images/batteries/solar-battery.png",
  },
];

async function seedProducts() {
  const connection = await database.getConnection();

  try {
    await connection.beginTransaction();

    const query = `
      INSERT INTO products (
        product_code,
        product_name,
        category,
        capacity_ah,
        voltage_v,
        warranty_months,
        dealer_price,
        stock_quantity,
        image_url
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        product_name = VALUES(product_name),
        category = VALUES(category),
        capacity_ah = VALUES(capacity_ah),
        voltage_v = VALUES(voltage_v),
        warranty_months = VALUES(warranty_months),
        dealer_price = VALUES(dealer_price),
        stock_quantity = VALUES(stock_quantity),
        image_url = VALUES(image_url)
    `;

    for (const product of products) {
      await connection.execute(query, [
        product.code,
        product.name,
        product.category,
        product.capacity,
        product.voltage,
        product.warranty,
        product.price,
        product.stock,
        product.image,
      ]);
    }

    await connection.commit();
    console.log("6 products seeded successfully.");
  } catch (error) {
    await connection.rollback();
    console.error("Product seed failed:", error.message);
    process.exitCode = 1;
  } finally {
    connection.release();
    await database.end();
  }
}

seedProducts();