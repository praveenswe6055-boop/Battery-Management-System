const database = require("../config/database");
const { salesforceRequest } = require("../config/salesforce");

function assertPortalId(value, label) {
  const portalId = Number(value);

  if (!Number.isInteger(portalId) || portalId < 1) {
    throw new Error(`Invalid ${label}`);
  }

  return portalId;
}

function toSalesforceDateTime(value) {
  return value ? new Date(value).toISOString() : null;
}

function toSalesforceText(value) {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === "string") {
    return value;
  }

  return JSON.stringify(value);
}

function getSalesforceDealerType(value) {
  const labels = {
    AUTHORIZED_DEALER: "Authorized Dealer",
    DISTRIBUTOR: "Distributor",
    SERVICE_PARTNER: "Service Partner",
  };

  return labels[value] || "Authorized Dealer";
}

async function getSalesforceError(response) {
  const result = await response.json().catch(() => null);

  if (Array.isArray(result) && result[0]?.message) {
    return result[0].message;
  }

  return `Salesforce request failed (${response.status})`;
}

async function salesforceQuery(soql) {
  const response = await salesforceRequest(
    `/query?q=${encodeURIComponent(soql)}`,
  );

  if (!response.ok) {
    throw new Error(await getSalesforceError(response));
  }

  return response.json();
}

async function upsertByPortalId({
  objectName,
  externalIdField,
  portalId,
  fields,
}) {
  const safePortalId = assertPortalId(
    portalId,
    `${objectName} portal ID`,
  );

  const response = await salesforceRequest(
    `/sobjects/${objectName}/${externalIdField}/${safePortalId}`,
    {
      method: "PATCH",
      body: JSON.stringify(fields),
    },
  );

  if (!response.ok) {
    throw new Error(await getSalesforceError(response));
  }

  const result = await salesforceQuery(
    `SELECT Id FROM ${objectName} ` +
      `WHERE ${externalIdField} = ${safePortalId} LIMIT 1`,
  );

  if (result.records.length !== 1) {
    throw new Error(
      `Salesforce did not return the synced ${objectName} record`,
    );
  }

  return result.records[0].Id;
}

async function syncDealerAccount(dealer) {
  const salesforceId = await upsertByPortalId({
    objectName: "Account",
    externalIdField: "Portal_Dealer_Id__c",
    portalId: dealer.id,
    fields: {
      Name: dealer.company_name,
      Phone: dealer.phone || null,
      Dealer_Code__c: dealer.dealer_code,
      Portal_Status__c: dealer.status,
      GST_Number__c: dealer.gst_number || null,
      Business_Address__c:
        dealer.business_address || null,
      Business_City__c: dealer.city || null,
      Business_State__c: dealer.state || null,
      Business_Pincode__c: dealer.pincode || null,
      Dealer_Type__c: getSalesforceDealerType(
        dealer.dealer_type,
      ),
      Credit_Limit__c: Number(dealer.credit_limit || 0),
      Available_Credit__c: Number(
        dealer.available_credit || 0,
      ),
    },
  });

  await database.execute(
    `
      UPDATE dealers
      SET salesforce_account_id = ?
      WHERE id = ?
    `,
    [salesforceId, dealer.id],
  );

  return salesforceId;
}

async function syncDealerUsers(users, accountId) {
  let syncedCount = 0;

  for (const user of users) {
    await upsertByPortalId({
      objectName: "Contact",
      externalIdField: "Portal_User_Id__c",
      portalId: user.id,
      fields: {
        AccountId: accountId,
        FirstName: user.first_name,
        LastName: user.last_name,
        Email: user.email,
        Portal_Role__c: user.role,
        Portal_Status__c: user.status,
      },
    });

    syncedCount += 1;
  }

  return syncedCount;
}

async function syncProducts(products) {
  let syncedCount = 0;

  for (const product of products) {
    const salesforceId = await upsertByPortalId({
      objectName: "Product2",
      externalIdField: "Portal_Product_Id__c",
      portalId: product.id,
      fields: {
        Name: product.product_name,
        ProductCode: product.product_code,
        IsActive: product.status === "ACTIVE",
        Battery_Category__c: product.category,
        Capacity_Ah__c: product.capacity_ah,
        Voltage_V__c: product.voltage_v,
        Warranty_Months__c: product.warranty_months,
        Dealer_Price__c: Number(product.dealer_price),
        Stock_Quantity__c: product.stock_quantity,
        Image_URL__c: product.image_url || null,
      },
    });

    await database.execute(
      `
        UPDATE products
        SET salesforce_product_id = ?
        WHERE id = ?
      `,
      [salesforceId, product.id],
    );

    syncedCount += 1;
  }

  return syncedCount;
}

async function syncDealerCatalog(dealerId) {
  const safeDealerId = assertPortalId(dealerId, "dealer ID");

  const [[dealer]] = await database.execute(
    `
      SELECT
        dealer.id,
        dealer.dealer_code,
        dealer.company_name,
        dealer.email,
        dealer.phone,
        dealer.status,
        profile.gst_number,
        profile.business_address,
        profile.city,
        profile.state,
        profile.pincode,
        profile.dealer_type,
        profile.credit_limit,
        profile.available_credit
      FROM dealers AS dealer
      LEFT JOIN dealer_profiles AS profile
        ON profile.dealer_id = dealer.id
      WHERE dealer.id = ?
      LIMIT 1
    `,
    [safeDealerId],
  );

  if (!dealer) {
    throw new Error("Dealer was not found in MySQL");
  }

  const [users] = await database.execute(
    `
      SELECT
        id,
        first_name,
        last_name,
        email,
        role,
        status
      FROM dealer_users
      WHERE dealer_id = ?
      ORDER BY id
    `,
    [safeDealerId],
  );

  const [products] = await database.execute(`
    SELECT
      id,
      product_code,
      product_name,
      category,
      capacity_ah,
      voltage_v,
      warranty_months,
      dealer_price,
      stock_quantity,
      image_url,
      status
    FROM products
    ORDER BY id
  `);

  const accountId = await syncDealerAccount(dealer);
  const contactCount = await syncDealerUsers(users, accountId);
  const productCount = await syncProducts(products);

  return {
    accountCount: 1,
    contactCount,
    productCount,
  };
}

async function syncOrderToSalesforce(orderId) {
  const safeOrderId = assertPortalId(orderId, "order ID");

  let [[order]] = await database.execute(
    `
      SELECT dealer_order.*, dealer.salesforce_account_id
      FROM dealer_orders AS dealer_order
      INNER JOIN dealers AS dealer
        ON dealer.id = dealer_order.dealer_id
      WHERE dealer_order.id = ?
      LIMIT 1
    `,
    [safeOrderId],
  );

  if (!order) {
    throw new Error("Order was not found in MySQL");
  }

  const [[missingProductLink]] = await database.execute(
    `
      SELECT COUNT(*) AS count
      FROM dealer_order_items AS order_item
      INNER JOIN products AS product
        ON product.id = order_item.product_id
      WHERE order_item.order_id = ?
        AND product.salesforce_product_id IS NULL
    `,
    [safeOrderId],
  );

  if (
    !order.salesforce_account_id ||
    Number(missingProductLink.count) > 0
  ) {
    await syncDealerCatalog(order.dealer_id);

    [[order]] = await database.execute(
      `
        SELECT dealer_order.*, dealer.salesforce_account_id
        FROM dealer_orders AS dealer_order
        INNER JOIN dealers AS dealer
          ON dealer.id = dealer_order.dealer_id
        WHERE dealer_order.id = ?
        LIMIT 1
      `,
      [safeOrderId],
    );
  }

  const dealerUserId = assertPortalId(
    order.dealer_user_id,
    "dealer user ID",
  );
  const contactResult = await salesforceQuery(
    `SELECT Id FROM Contact ` +
      `WHERE Portal_User_Id__c = ${dealerUserId} LIMIT 1`,
  );

  const salesforceOrderId = await upsertByPortalId({
    objectName: "Dealer_Order__c",
    externalIdField: "Portal_Order_Id__c",
    portalId: safeOrderId,
    fields: {
      Dealer__c: order.salesforce_account_id,
      Dealer_User__c: contactResult.records[0]?.Id || null,
      External_Order_Number__c: order.order_number,
      Status__c: order.status,
      Subtotal__c: Number(order.subtotal),
      Tax_Amount__c: Number(order.tax_amount),
      Total_Amount__c: Number(order.total_amount),
      Payment_Method__c: order.payment_method,
      Payment_Status__c: order.payment_status,
      Shipping_Address__c: toSalesforceText(
        order.shipping_address,
      ),
      Portal_Created_At__c: toSalesforceDateTime(
        order.created_at,
      ),
      Portal_Updated_At__c: toSalesforceDateTime(
        order.updated_at,
      ),
    },
  });

  await database.execute(
    `
      UPDATE dealer_orders
      SET salesforce_order_id = ?
      WHERE id = ?
    `,
    [salesforceOrderId, safeOrderId],
  );

  const [items] = await database.execute(
    `
      SELECT order_item.*, product.salesforce_product_id
      FROM dealer_order_items AS order_item
      INNER JOIN products AS product
        ON product.id = order_item.product_id
      WHERE order_item.order_id = ?
      ORDER BY order_item.id
    `,
    [safeOrderId],
  );

  for (const item of items) {
    await upsertByPortalId({
      objectName: "Dealer_Order_Item__c",
      externalIdField: "Portal_Order_Item_Id__c",
      portalId: item.id,
      fields: {
        Dealer_Order__c: salesforceOrderId,
        Battery_Product__c:
          item.salesforce_product_id || null,
        Product_Code__c: item.product_code,
        Product_Name__c: item.product_name,
        Quantity__c: item.quantity,
        Unit_Price__c: Number(item.unit_price),
        Line_Total__c: Number(item.line_total),
        Portal_Created_At__c: toSalesforceDateTime(
          item.created_at,
        ),
      },
    });
  }

  return {
    orderCount: 1,
    orderItemCount: items.length,
    salesforceOrderId,
  };
}

async function syncDealerOrders(dealerId) {
  const safeDealerId = assertPortalId(dealerId, "dealer ID");
  const [orders] = await database.execute(
    `
      SELECT id
      FROM dealer_orders
      WHERE dealer_id = ?
      ORDER BY id
    `,
    [safeDealerId],
  );
  let orderItemCount = 0;

  for (const order of orders) {
    const result = await syncOrderToSalesforce(order.id);
    orderItemCount += result.orderItemCount;
  }

  return {
    orderCount: orders.length,
    orderItemCount,
  };
}

async function refreshDealerOrderStatuses(dealerId) {
  const safeDealerId = assertPortalId(dealerId, "dealer ID");
  const [orders] = await database.execute(
    `
      SELECT id
      FROM dealer_orders
      WHERE dealer_id = ?
        AND salesforce_order_id IS NOT NULL
      ORDER BY id
    `,
    [safeDealerId],
  );

  if (orders.length === 0) {
    return { refreshedCount: 0 };
  }

  const portalOrderIds = orders
    .map((order) => Number(order.id))
    .join(", ");
  const salesforceOrders = await salesforceQuery(
    `SELECT Portal_Order_Id__c, Status__c ` +
      `FROM Dealer_Order__c ` +
      `WHERE Portal_Order_Id__c IN (${portalOrderIds})`,
  );
  const allowedStatuses = new Set([
    "PENDING",
    "CONFIRMED",
    "PROCESSING",
    "SHIPPED",
    "DELIVERED",
    "CANCELLED",
  ]);
  let refreshedCount = 0;

  for (const salesforceOrder of salesforceOrders.records) {
    const status = salesforceOrder.Status__c;
    const portalOrderId = Number(
      salesforceOrder.Portal_Order_Id__c,
    );

    if (
      !allowedStatuses.has(status) ||
      !Number.isInteger(portalOrderId)
    ) {
      continue;
    }

    await database.execute(
      `
        UPDATE dealer_orders
        SET status = ?
        WHERE id = ? AND dealer_id = ?
      `,
      [status, portalOrderId, safeDealerId],
    );
    refreshedCount += 1;
  }

  return { refreshedCount };
}

async function syncPaymentTransaction(paymentId) {
  const safePaymentId = assertPortalId(paymentId, "payment ID");
  const [[payment]] = await database.execute(
    `
      SELECT
        payment.*,
        dealer_order.dealer_id
      FROM payment_transactions AS payment
      INNER JOIN dealer_orders AS dealer_order
        ON dealer_order.id = payment.order_id
      WHERE payment.id = ?
      LIMIT 1
    `,
    [safePaymentId],
  );

  if (!payment) {
    throw new Error("Payment transaction was not found in MySQL");
  }

  const orderSync = await syncOrderToSalesforce(payment.order_id);
  const [[dealer]] = await database.execute(
    `
      SELECT salesforce_account_id
      FROM dealers
      WHERE id = ?
      LIMIT 1
    `,
    [payment.dealer_id],
  );

  const salesforcePaymentId = await upsertByPortalId({
    objectName: "Dealer_Payment__c",
    externalIdField: "Portal_Payment_Id__c",
    portalId: safePaymentId,
    fields: {
      Dealer__c: dealer.salesforce_account_id,
      Dealer_Order__c: orderSync.salesforceOrderId,
      Provider__c: payment.provider,
      Amount__c: Number(payment.amount),
      Currency__c: payment.currency,
      Status__c: payment.status,
      Razorpay_Order_Id__c: payment.razorpay_order_id || null,
      Razorpay_Payment_Id__c:
        payment.razorpay_payment_id || null,
      Failure_Reason__c: payment.failure_reason || null,
      Paid_At__c: toSalesforceDateTime(payment.paid_at),
      Portal_Created_At__c: toSalesforceDateTime(
        payment.created_at,
      ),
      Portal_Updated_At__c: toSalesforceDateTime(
        payment.updated_at,
      ),
    },
  });

  return {
    paymentCount: 1,
    salesforcePaymentId,
  };
}

async function syncCustomerCollection(collectionId) {
  const safeCollectionId = assertPortalId(
    collectionId,
    "customer collection ID",
  );
  let [[collection]] = await database.execute(
    `
      SELECT
        collection.*,
        dealer.salesforce_account_id
      FROM customer_payment_requests AS collection
      INNER JOIN dealers AS dealer
        ON dealer.id = collection.dealer_id
      WHERE collection.id = ?
      LIMIT 1
    `,
    [safeCollectionId],
  );

  if (!collection) {
    throw new Error("Customer collection was not found in MySQL");
  }

  if (!collection.salesforce_account_id) {
    await syncDealerCatalog(collection.dealer_id);
    [[collection]] = await database.execute(
      `
        SELECT
          collection.*,
          dealer.salesforce_account_id
        FROM customer_payment_requests AS collection
        INNER JOIN dealers AS dealer
          ON dealer.id = collection.dealer_id
        WHERE collection.id = ?
        LIMIT 1
      `,
      [safeCollectionId],
    );
  }

  const creatorId = assertPortalId(
    collection.created_by_user_id,
    "dealer user ID",
  );
  const contactResult = await salesforceQuery(
    `SELECT Id FROM Contact ` +
      `WHERE Portal_User_Id__c = ${creatorId} LIMIT 1`,
  );

  const salesforceCollectionId = await upsertByPortalId({
    objectName: "Customer_Collection__c",
    externalIdField: "Portal_Collection_Id__c",
    portalId: safeCollectionId,
    fields: {
      Dealer__c: collection.salesforce_account_id,
      Created_By_Dealer_User__c:
        contactResult.records[0]?.Id || null,
      Reference_Number__c: collection.reference_number,
      Invoice_Number__c:
        collection.customer_invoice_number || null,
      Customer_Name__c: collection.customer_name,
      Customer_Email__c: collection.customer_email || null,
      Customer_Phone__c: collection.customer_phone || null,
      Description__c: collection.description,
      Amount__c: Number(collection.amount),
      Currency__c: collection.currency,
      Status__c: collection.status,
      Razorpay_Payment_Link_Id__c:
        collection.razorpay_payment_link_id || null,
      Payment_Link_URL__c: collection.short_url || null,
      Razorpay_Payment_Id__c:
        collection.razorpay_payment_id || null,
      Expires_At__c: toSalesforceDateTime(
        collection.expires_at,
      ),
      Paid_At__c: toSalesforceDateTime(collection.paid_at),
      Portal_Created_At__c: toSalesforceDateTime(
        collection.created_at,
      ),
      Portal_Updated_At__c: toSalesforceDateTime(
        collection.updated_at,
      ),
    },
  });

  return {
    collectionCount: 1,
    salesforceCollectionId,
  };
}

async function syncDealerPayments(dealerId) {
  const safeDealerId = assertPortalId(dealerId, "dealer ID");
  const [payments] = await database.execute(
    `
      SELECT payment.id
      FROM payment_transactions AS payment
      INNER JOIN dealer_orders AS dealer_order
        ON dealer_order.id = payment.order_id
      WHERE dealer_order.dealer_id = ?
      ORDER BY payment.id
    `,
    [safeDealerId],
  );
  const [collections] = await database.execute(
    `
      SELECT id
      FROM customer_payment_requests
      WHERE dealer_id = ?
      ORDER BY id
    `,
    [safeDealerId],
  );

  for (const payment of payments) {
    await syncPaymentTransaction(payment.id);
  }

  for (const collection of collections) {
    await syncCustomerCollection(collection.id);
  }

  return {
    paymentCount: payments.length,
    collectionCount: collections.length,
  };
}

function escapeSoqlText(value) {
  return String(value)
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'");
}

async function upsertByExternalText({
  objectName,
  externalIdField,
  externalIdValue,
  fields,
}) {
  const value = String(externalIdValue || "").trim();

  if (!value) {
    throw new Error(`Invalid ${objectName} external ID`);
  }

  const response = await salesforceRequest(
    `/sobjects/${objectName}/${externalIdField}/${encodeURIComponent(
      value,
    )}`,
    {
      method: "PATCH",
      body: JSON.stringify(fields),
    },
  );

  if (!response.ok) {
    throw new Error(await getSalesforceError(response));
  }

  const result = await salesforceQuery(
    `SELECT Id FROM ${objectName} WHERE ${externalIdField} = ` +
      `'${escapeSoqlText(value)}' LIMIT 1`,
  );

  if (result.records.length !== 1) {
    throw new Error(
      `Salesforce did not return the synced ${objectName} record`,
    );
  }

  return result.records[0].Id;
}

function getSalesforceCaseStatus(portalStatus) {
  const statusMap = {
    OPEN: "New",
    IN_PROGRESS: "Working",
    WAITING_FOR_CUSTOMER: "Escalated",
    RESOLVED: "Closed",
    CLOSED: "Closed",
  };

  return statusMap[portalStatus] || "New";
}

function getSalesforceCasePriority(portalPriority) {
  const priorityMap = {
    LOW: "Low",
    NORMAL: "Medium",
    HIGH: "High",
    URGENT: "High",
  };

  return priorityMap[portalPriority] || "Medium";
}

async function syncServiceRequest(serviceRequestId) {
  const safeRequestId = assertPortalId(
    serviceRequestId,
    "service request ID",
  );
  let [[serviceRequest]] = await database.execute(
    `
      SELECT
        service_request.*,
        dealer.salesforce_account_id,
        dealer_order.salesforce_order_id
      FROM service_requests AS service_request
      INNER JOIN dealers AS dealer
        ON dealer.id = service_request.dealer_id
      LEFT JOIN dealer_orders AS dealer_order
        ON dealer_order.id = service_request.related_order_id
      WHERE service_request.id = ?
      LIMIT 1
    `,
    [safeRequestId],
  );

  if (!serviceRequest) {
    throw new Error("Service request was not found in MySQL");
  }

  if (!serviceRequest.salesforce_account_id) {
    await syncDealerCatalog(serviceRequest.dealer_id);
  }

  if (
    serviceRequest.related_order_id &&
    !serviceRequest.salesforce_order_id
  ) {
    await syncOrderToSalesforce(serviceRequest.related_order_id);
  }

  [[serviceRequest]] = await database.execute(
    `
      SELECT
        service_request.*,
        dealer.salesforce_account_id,
        dealer_order.salesforce_order_id
      FROM service_requests AS service_request
      INNER JOIN dealers AS dealer
        ON dealer.id = service_request.dealer_id
      LEFT JOIN dealer_orders AS dealer_order
        ON dealer_order.id = service_request.related_order_id
      WHERE service_request.id = ?
      LIMIT 1
    `,
    [safeRequestId],
  );

  const dealerUserId = assertPortalId(
    serviceRequest.dealer_user_id,
    "dealer user ID",
  );
  const contactResult = await salesforceQuery(
    `SELECT Id FROM Contact ` +
      `WHERE Portal_User_Id__c = ${dealerUserId} LIMIT 1`,
  );

  const salesforceCaseId = await upsertByExternalText({
    objectName: "Case",
    externalIdField: "Portal_Request_Number__c",
    externalIdValue: serviceRequest.request_number,
    fields: {
      AccountId: serviceRequest.salesforce_account_id,
      ContactId: contactResult.records[0]?.Id || null,
      Subject:
        `${serviceRequest.request_type} - ` +
        serviceRequest.battery_serial_number,
      Description: serviceRequest.description,
      Origin: "Web",
      Status: getSalesforceCaseStatus(serviceRequest.status),
      Priority: getSalesforceCasePriority(
        serviceRequest.priority,
      ),
      Portal_Request_Type__c: serviceRequest.request_type,
      Battery_Serial_Number__c:
        serviceRequest.battery_serial_number,
      Portal_Priority__c:
        serviceRequest.priority.charAt(0) +
        serviceRequest.priority.slice(1).toLowerCase(),
      Related_Dealer_Order__c:
        serviceRequest.salesforce_order_id || null,
    },
  });

  await database.execute(
    `
      UPDATE service_requests
      SET salesforce_case_id = ?
      WHERE id = ?
    `,
    [salesforceCaseId, safeRequestId],
  );

  return {
    serviceRequestCount: 1,
    salesforceCaseId,
  };
}

async function syncDealerServiceRequests(dealerId) {
  const safeDealerId = assertPortalId(dealerId, "dealer ID");
  const [requests] = await database.execute(
    `
      SELECT id
      FROM service_requests
      WHERE dealer_id = ?
      ORDER BY id
    `,
    [safeDealerId],
  );

  for (const serviceRequest of requests) {
    await syncServiceRequest(serviceRequest.id);
  }

  return {
    serviceRequestCount: requests.length,
  };
}

async function refreshDealerServiceRequestStatuses(dealerId) {
  const safeDealerId = assertPortalId(dealerId, "dealer ID");
  const [requests] = await database.execute(
    `
      SELECT id, request_number
      FROM service_requests
      WHERE dealer_id = ?
        AND salesforce_case_id IS NOT NULL
      ORDER BY id
    `,
    [safeDealerId],
  );

  if (requests.length === 0) {
    return { refreshedCount: 0 };
  }

  const requestNumbers = requests
    .map(
      (request) =>
        `'${escapeSoqlText(request.request_number)}'`,
    )
    .join(", ");
  const cases = await salesforceQuery(
    `SELECT Portal_Request_Number__c, Status FROM Case ` +
      `WHERE Portal_Request_Number__c IN (${requestNumbers})`,
  );
  const portalStatusMap = {
    New: "OPEN",
    Working: "IN_PROGRESS",
    Escalated: "WAITING_FOR_CUSTOMER",
    Closed: "CLOSED",
  };
  let refreshedCount = 0;

  for (const salesforceCase of cases.records) {
    const portalStatus = portalStatusMap[salesforceCase.Status];

    if (!portalStatus) {
      continue;
    }

    await database.execute(
      `
        UPDATE service_requests
        SET status = ?
        WHERE dealer_id = ?
          AND request_number = ?
      `,
      [
        portalStatus,
        safeDealerId,
        salesforceCase.Portal_Request_Number__c,
      ],
    );
    refreshedCount += 1;
  }

  return { refreshedCount };
}

module.exports = {
  syncDealerCatalog,
  syncDealerOrders,
  refreshDealerOrderStatuses,
  syncOrderToSalesforce,
  syncCustomerCollection,
  syncDealerPayments,
  syncPaymentTransaction,
  refreshDealerServiceRequestStatuses,
  syncDealerServiceRequests,
  syncServiceRequest,
};
