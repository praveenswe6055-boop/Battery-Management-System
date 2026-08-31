const express = require("express");
const database = require("../config/database");
const {
  syncDealerCatalog,
} = require("../services/salesforceSyncService");

const router = express.Router();

function requireLogin(request, response) {
  if (!request.session?.user) {
    response.status(401).json({
      message: "Authentication required.",
    });
    return false;
  }

  return true;
}

function getDealerTypeLabel(value) {
  const labels = {
    AUTHORIZED_DEALER: "Authorized Dealer",
    DISTRIBUTOR: "Distributor",
    SERVICE_PARTNER: "Service Partner",
  };

  return labels[value] || "Authorized Dealer";
}

function getStatusLabel(value) {
  return value.charAt(0) + value.slice(1).toLowerCase();
}

function mapProfile(row) {
  return {
    dealerCode: row.dealer_code,
    companyName: row.company_name,
    email: row.user_email,
    phone: row.phone || "",
    gstNumber: row.gst_number || "",
    salesforceAccountId:
      row.salesforce_account_id || "Pending sync",
    address: row.business_address || "",
    city: row.city || "",
    state: row.state || "",
    pincode: row.pincode || "",
    status: getStatusLabel(row.status),
    dealerType: getDealerTypeLabel(row.dealer_type),
    creditLimit: Number(row.credit_limit || 0),
    availableCredit: Number(row.available_credit || 0),
  };
}

async function getProfile(dealerId, userId) {
  const [[profile]] = await database.execute(
    `
      SELECT
        dealer.dealer_code,
        dealer.company_name,
        dealer.phone,
        dealer.status,
        dealer.salesforce_account_id,
        user_account.email AS user_email,
        profile.gst_number,
        profile.business_address,
        profile.city,
        profile.state,
        profile.pincode,
        profile.dealer_type,
        profile.credit_limit,
        profile.available_credit
      FROM dealers AS dealer
      INNER JOIN dealer_users AS user_account
        ON user_account.id = ?
        AND user_account.dealer_id = dealer.id
      LEFT JOIN dealer_profiles AS profile
        ON profile.dealer_id = dealer.id
      WHERE dealer.id = ?
      LIMIT 1
    `,
    [userId, dealerId],
  );

  return profile;
}

router.get("/", async (request, response, next) => {
  if (!requireLogin(request, response)) {
    return;
  }

  try {
    const profile = await getProfile(
      request.session.user.dealerId,
      request.session.user.userId,
    );

    if (!profile) {
      return response.status(404).json({
        message: "Dealer profile was not found.",
      });
    }

    return response.status(200).json({
      profile: mapProfile(profile),
    });
  } catch (error) {
    next(error);
  }
});

router.put("/", async (request, response, next) => {
  if (!requireLogin(request, response)) {
    return;
  }

  if (request.session.user.role !== "DEALER_ADMIN") {
    return response.status(403).json({
      message: "Only the dealer admin can update the profile.",
    });
  }

  const companyName = String(
    request.body.companyName || "",
  ).trim();
  const email = String(request.body.email || "")
    .trim()
    .toLowerCase();
  const phone = String(request.body.phone || "").trim();
  const gstNumber = String(
    request.body.gstNumber || "",
  )
    .trim()
    .toUpperCase();
  const address = String(request.body.address || "").trim();
  const city = String(request.body.city || "").trim();
  const state = String(request.body.state || "").trim();
  const pincode = String(request.body.pincode || "").trim();

  if (
    !companyName ||
    !email ||
    !phone ||
    !gstNumber ||
    !address ||
    !city ||
    !state ||
    !pincode ||
    !email.includes("@")
  ) {
    return response.status(400).json({
      message: "Complete valid dealer profile details are required.",
    });
  }

  if (
    companyName.length > 150 ||
    email.length > 150 ||
    phone.length > 20 ||
    gstNumber.length > 30 ||
    city.length > 80 ||
    state.length > 80 ||
    pincode.length > 10
  ) {
    return response.status(400).json({
      message: "One or more profile values are too long.",
    });
  }

  const connection = await database.getConnection();

  try {
    await connection.beginTransaction();

    await connection.execute(
      `
        UPDATE dealers
        SET company_name = ?, email = ?, phone = ?
        WHERE id = ?
      `,
      [
        companyName,
        email,
        phone,
        request.session.user.dealerId,
      ],
    );

    await connection.execute(
      `
        UPDATE dealer_users
        SET email = ?
        WHERE id = ? AND dealer_id = ?
      `,
      [
        email,
        request.session.user.userId,
        request.session.user.dealerId,
      ],
    );

    await connection.execute(
      `
        INSERT INTO dealer_profiles (
          dealer_id,
          gst_number,
          business_address,
          city,
          state,
          pincode
        )
        VALUES (?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          gst_number = VALUES(gst_number),
          business_address = VALUES(business_address),
          city = VALUES(city),
          state = VALUES(state),
          pincode = VALUES(pincode)
      `,
      [
        request.session.user.dealerId,
        gstNumber,
        address,
        city,
        state,
        pincode,
      ],
    );

    await connection.commit();
  } catch (error) {
    await connection.rollback();

    if (error.code === "ER_DUP_ENTRY") {
      return response.status(409).json({
        message: "This email is already used by another dealer user.",
      });
    }

    return next(error);
  } finally {
    connection.release();
  }

  request.session.user.companyName = companyName;
  request.session.user.email = email;

  let salesforceSyncStatus = "SYNCED";

  try {
    await syncDealerCatalog(request.session.user.dealerId);
  } catch (salesforceError) {
    salesforceSyncStatus = "PENDING";
    console.error(
      "Salesforce dealer profile sync failed:",
      salesforceError.message,
    );
  }

  try {
    const profile = await getProfile(
      request.session.user.dealerId,
      request.session.user.userId,
    );

    request.session.user.salesforceAccountId =
      profile.salesforce_account_id;

    return response.status(200).json({
      message: "Dealer profile updated successfully.",
      profile: mapProfile(profile),
      salesforceSyncStatus,
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
