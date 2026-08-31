const bcrypt = require("bcrypt");
const dotenv = require("dotenv");

dotenv.config();

const database = require("../config/database");

async function seedDemoDealer() {
  const password = process.env.DEMO_DEALER_PASSWORD;

  if (!password) {
    throw new Error(
      "DEMO_DEALER_PASSWORD is missing from .env",
    );
  }

  const connection = await database.getConnection();

  try {
    await connection.beginTransaction();

    const [existingDealers] = await connection.execute(
      `
        SELECT id
        FROM dealers
        WHERE dealer_code = ?
      `,
      ["DLR-1001"],
    );

    let dealerId;

    if (existingDealers.length === 0) {
      const [dealerResult] = await connection.execute(
        `
          INSERT INTO dealers (
            dealer_code,
            company_name,
            email,
            phone,
            status
          )
          VALUES (?, ?, ?, ?, ?)
        `,
        [
          "DLR-1001",
          "Demo Battery Distributors",
          "dealer@example.com",
          "9876543210",
          "ACTIVE",
        ],
      );

      dealerId = dealerResult.insertId;
    } else {
      dealerId = existingDealers[0].id;

      await connection.execute(
        `
          UPDATE dealers
          SET status = 'ACTIVE'
          WHERE id = ?
        `,
        [dealerId],
      );
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const [existingUsers] = await connection.execute(
      `
        SELECT id
        FROM dealer_users
        WHERE email = ?
      `,
      ["dealer@example.com"],
    );

    if (existingUsers.length === 0) {
      await connection.execute(
        `
          INSERT INTO dealer_users (
            dealer_id,
            first_name,
            last_name,
            email,
            password_hash,
            role,
            status
          )
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `,
        [
          dealerId,
          "Demo",
          "Dealer",
          "dealer@example.com",
          passwordHash,
          "DEALER_ADMIN",
          "ACTIVE",
        ],
      );
    } else {
      await connection.execute(
        `
          UPDATE dealer_users
          SET
            dealer_id = ?,
            password_hash = ?,
            status = 'ACTIVE'
          WHERE email = ?
        `,
        [
          dealerId,
          passwordHash,
          "dealer@example.com",
        ],
      );
    }

    await connection.commit();

    console.log("Demo dealer created successfully.");
    console.log("Dealer code: DLR-1001");
    console.log("Email: dealer@example.com");
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
    await database.end();
  }
}

seedDemoDealer().catch((error) => {
  console.error("Seed failed:", error.message);
  process.exitCode = 1;
});