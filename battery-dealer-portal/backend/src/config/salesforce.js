const SALESFORCE_API_VERSION = "v67.0";
const TOKEN_CACHE_DURATION_MS = 90 * 60 * 1000;

let cachedConnection = null;

function getRequiredEnvironmentValue(name) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`${name} is not configured`);
  }

  return value;
}

async function requestAccessToken(forceRefresh = false) {
  if (
    !forceRefresh &&
    cachedConnection &&
    cachedConnection.expiresAt > Date.now()
  ) {
    return cachedConnection;
  }

  const loginUrl = getRequiredEnvironmentValue(
    "SALESFORCE_LOGIN_URL",
  ).replace(/\/$/, "");

  const requestBody = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: getRequiredEnvironmentValue("SALESFORCE_CLIENT_ID"),
    client_secret: getRequiredEnvironmentValue(
      "SALESFORCE_CLIENT_SECRET",
    ),
  });

  const response = await fetch(
    `${loginUrl}/services/oauth2/token`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: requestBody,
    },
  );

  const result = await response.json().catch(() => ({}));

  if (!response.ok) {
    const reason =
      result.error_description ||
      result.error ||
      "Salesforce rejected the authentication request";

    throw new Error(
      `Salesforce authentication failed (${response.status}): ${reason}`,
    );
  }

  cachedConnection = {
    accessToken: result.access_token,
    instanceUrl: result.instance_url,
    expiresAt: Date.now() + TOKEN_CACHE_DURATION_MS,
  };

  return cachedConnection;
}

async function salesforceRequest(path, options = {}) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const connection = await requestAccessToken(attempt === 1);

    const response = await fetch(
      `${connection.instanceUrl}/services/data/${SALESFORCE_API_VERSION}${path}`,
      {
        ...options,
        headers: {
          Authorization: `Bearer ${connection.accessToken}`,
          "Content-Type": "application/json",
          ...(options.headers || {}),
        },
      },
    );

    if (response.status === 401 && attempt === 0) {
      cachedConnection = null;
      continue;
    }

    return response;
  }

  throw new Error("Salesforce authentication retry failed");
}

async function checkSalesforceConnection() {
  const response = await salesforceRequest("/sobjects");

  if (!response.ok) {
    throw new Error(
      `Salesforce API health check failed (${response.status})`,
    );
  }
}

module.exports = {
  checkSalesforceConnection,
  salesforceRequest,
};
