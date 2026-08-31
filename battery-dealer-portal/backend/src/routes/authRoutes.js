const express = require("express");
const bcrypt = require("bcrypt");
const database = require("../config/database");

const router = express.Router();

router.post("/login", async (request, response, next) => {
  try {
    const { dealerCode, email, password } = request.body;

    const values = [dealerCode, email, password];

    const hasMissingValue = values.some(
      (value) =>
        typeof value !== "string" || !value.trim(),
    );

    if (hasMissingValue) {
      return response.status(400).json({
        message:
          "Dealer code, email and password are required.",
      });
    }

    const normalizedDealerCode = dealerCode
      .trim()
      .toUpperCase();

    const normalizedEmail = email.trim().toLowerCase();

    const [users] = await database.execute(
      `
        SELECT
          user_account.id AS user_id,
          user_account.dealer_id,
          user_account.first_name,
          user_account.last_name,
          user_account.email,
          user_account.password_hash,
          user_account.role,
          user_account.status AS user_status,
          dealer.dealer_code,
          dealer.company_name,
          dealer.status AS dealer_status,
          dealer.salesforce_account_id
        FROM dealer_users AS user_account
        INNER JOIN dealers AS dealer
          ON dealer.id = user_account.dealer_id
        WHERE dealer.dealer_code = ?
          AND LOWER(user_account.email) = ?
        LIMIT 1
      `,
      [normalizedDealerCode, normalizedEmail],
    );

    if (users.length === 0) {
      return response.status(401).json({
        message: "Invalid dealer login credentials.",
      });
    }

    const user = users[0];

    if (
      user.user_status !== "ACTIVE" ||
      user.dealer_status !== "ACTIVE"
    ) {
      return response.status(403).json({
        message:
          "This dealer account is not currently active.",
      });
    }

    const passwordMatches = await bcrypt.compare(
      password,
      user.password_hash,
    );

    if (!passwordMatches) {
      return response.status(401).json({
        message: "Invalid dealer login credentials.",
      });
    }

    await database.execute(
      `
        UPDATE dealer_users
        SET last_login_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `,
      [user.user_id],
    );

    request.session.user = {
      userId: user.user_id,
      dealerId: user.dealer_id,
      dealerCode: user.dealer_code,
      companyName: user.company_name,
      firstName: user.first_name,
      lastName: user.last_name,
      email: user.email,
      role: user.role,
      salesforceAccountId:
        user.salesforce_account_id,
    };

    return response.status(200).json({
      message: "Login successful.",
      user: request.session.user,
    });
  } catch (error) {
    next(error);
  }
});

router.get("/me", (request, response) => {
  if (!request.session?.user) {
    return response.status(401).json({
      message: "Authentication required.",
    });
  }

  return response.status(200).json({
    user: request.session.user,
  });
});

router.post("/logout", (request, response, next) => {
  request.session.destroy((error) => {
    if (error) {
      return next(error);
    }

    response.clearCookie("dealer.sid");

    return response.status(200).json({
      message: "Logout successful.",
    });
  });
});

module.exports = router;