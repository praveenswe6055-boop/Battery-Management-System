import { useEffect, useState } from "react";
import QRCode from "qrcode";
import PortalSidebar from "../components/PortalSidebar";
import { apiUrl } from "../config/api";
import "./CustomerPaymentsPage.css";

const emptyForm = {
  customerName: "",
  customerEmail: "",
  customerPhone: "",
  invoiceNumber: "",
  description: "",
  amount: "",
};

function PaymentQrCode({ paymentRequest, compact = false }) {
  const [qrCodeUrl, setQrCodeUrl] = useState("");

  useEffect(() => {
    let isCurrent = true;

    QRCode.toDataURL(paymentRequest.shortUrl, {
      width: compact ? 190 : 280,
      margin: 2,
      errorCorrectionLevel: "H",
      color: {
        dark: "#07131f",
        light: "#ffffff",
      },
    }).then((dataUrl) => {
      if (isCurrent) {
        setQrCodeUrl(dataUrl);
      }
    });

    return () => {
      isCurrent = false;
    };
  }, [compact, paymentRequest.shortUrl]);

  return (
    <div className={`payment-qr-code ${compact ? "compact" : ""}`}>
      {qrCodeUrl ? (
        <>
          <img
            src={qrCodeUrl}
            alt={`Payment QR code for ${paymentRequest.customerName}`}
          />
          <span>Scan to pay securely</span>
          <a
            href={qrCodeUrl}
            download={`VoltCore-${paymentRequest.referenceNumber}-QR.png`}
          >
            Download QR Code
          </a>
        </>
      ) : (
        <span>Generating QR code...</span>
      )}
    </div>
  );
}

function CustomerPaymentsPage() {
  const [form, setForm] = useState(emptyForm);
  const [paymentRequests, setPaymentRequests] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [refreshMessage, setRefreshMessage] = useState("");
  const [createdRequest, setCreatedRequest] = useState(null);
  const [qrPaymentRequest, setQrPaymentRequest] = useState(null);

  async function loadPaymentRequests() {
    try {
      const response = await fetch(
        apiUrl("/api/customer-payments"),
        {
          credentials: "include",
        },
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.message || "Unable to load customer payments.",
        );
      }

      setPaymentRequests(data.paymentRequests);
      setErrorMessage("");
      return data.paymentRequests;
    } catch (error) {
      setErrorMessage(error.message);
      return null;
    } finally {
      setIsLoading(false);
    }
  }

  async function handleRefreshStatus() {
    try {
      setIsRefreshing(true);
      setRefreshMessage("");

      const refreshedRequests = await loadPaymentRequests();

      if (!refreshedRequests) {
        setRefreshMessage(
          "Unable to check Razorpay. Please try again.",
        );
        return;
      }

      const paidCount = refreshedRequests.filter(
        (item) => item.status === "PAID",
      ).length;
      const pendingCount = refreshedRequests.filter((item) =>
        ["CREATED", "SENT"].includes(item.status),
      ).length;

      setRefreshMessage(
        `Status updated — Paid: ${paidCount}, Pending: ${pendingCount}`,
      );
    } finally {
      setIsRefreshing(false);
    }
  }

  useEffect(() => {
    loadPaymentRequests();

    const refreshTimer = window.setInterval(
      loadPaymentRequests,
      15000,
    );

    return () => window.clearInterval(refreshTimer);
  }, []);

  function handleChange(event) {
    setForm({
      ...form,
      [event.target.name]: event.target.value,
    });
  }

  async function handleSubmit(event) {
    event.preventDefault();

    if (!form.customerEmail && !form.customerPhone) {
      alert("Enter the customer email or phone number.");
      return;
    }

    try {
      setIsSubmitting(true);

      const response = await fetch(
        apiUrl("/api/customer-payments"),
        {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(form),
        },
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.message || "Unable to create the payment link.",
        );
      }

      setCreatedRequest(data.paymentRequest);
      setForm(emptyForm);
      await loadPaymentRequests();
    } catch (error) {
      alert(error.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function copyPaymentLink(shortUrl) {
    try {
      await navigator.clipboard.writeText(shortUrl);
      alert("Payment link copied successfully.");
    } catch {
      window.prompt("Copy this payment link:", shortUrl);
    }
  }

  function shareOnWhatsApp(paymentRequest) {
    const message = encodeURIComponent(
      `Payment request from VoltCore Batteries\n` +
        `Reference: ${paymentRequest.referenceNumber}\n` +
        `Amount: ₹${paymentRequest.amount.toLocaleString("en-IN")}\n` +
        `Pay securely: ${paymentRequest.shortUrl}`,
    );
    const phone = String(paymentRequest.customerPhone || "").replace(
      /\D/g,
      "",
    );
    const destination = phone
      ? `https://wa.me/${phone}?text=${message}`
      : `https://wa.me/?text=${message}`;

    window.open(destination, "_blank", "noopener,noreferrer");
  }

  const paidRequests = paymentRequests.filter(
    (item) => item.status === "PAID",
  );
  const openRequests = paymentRequests.filter((item) =>
    ["CREATED", "SENT"].includes(item.status),
  );
  const outstandingAmount = openRequests.reduce(
    (total, item) => total + item.amount,
    0,
  );

  return (
    <div className="dashboard-layout">
      <PortalSidebar />

      <main className="dashboard-main customer-collections-page">
        <header className="customer-collections-header">
          <div>
            <p className="dashboard-eyebrow">CUSTOMER COLLECTIONS</p>
            <h1>Send Payment Links</h1>
            <p>
              Create secure Razorpay links and track customer payments.
            </p>
          </div>

          <div className="refresh-customer-status">
            <button
              type="button"
              onClick={handleRefreshStatus}
              disabled={isRefreshing}
            >
              {isRefreshing
                ? "Checking Razorpay..."
                : "Refresh Status"}
            </button>
            {refreshMessage ? <small>{refreshMessage}</small> : null}
          </div>
        </header>

        <section className="collection-overview">
          <article>
            <span>₹</span>
            <div>
              <small>Outstanding</small>
              <strong>
                ₹{outstandingAmount.toLocaleString("en-IN")}
              </strong>
            </div>
          </article>

          <article>
            <span>↗</span>
            <div>
              <small>Links Sent</small>
              <strong>{openRequests.length}</strong>
            </div>
          </article>

          <article>
            <span>✓</span>
            <div>
              <small>Paid</small>
              <strong>{paidRequests.length}</strong>
            </div>
          </article>
        </section>

        <section className="customer-payment-layout">
          <form
            className="customer-payment-form"
            onSubmit={handleSubmit}
          >
            <div className="collection-section-heading">
              <p>NEW REQUEST</p>
              <h2>Create Customer Payment Link</h2>
              <span>
                Razorpay can notify the customer through email or SMS.
              </span>
            </div>

            <div className="customer-payment-fields">
              <label>
                Customer Name
                <input
                  name="customerName"
                  value={form.customerName}
                  onChange={handleChange}
                  required
                />
              </label>

              <label>
                Invoice Number
                <input
                  name="invoiceNumber"
                  value={form.invoiceNumber}
                  onChange={handleChange}
                  placeholder="INV-1001"
                />
              </label>

              <label>
                Customer Email
                <input
                  name="customerEmail"
                  type="email"
                  value={form.customerEmail}
                  onChange={handleChange}
                  placeholder="customer@example.com"
                />
              </label>

              <label>
                Customer Phone
                <input
                  name="customerPhone"
                  type="tel"
                  value={form.customerPhone}
                  onChange={handleChange}
                  placeholder="9876543210"
                />
              </label>

              <label className="full-collection-field">
                Payment Description
                <textarea
                  name="description"
                  value={form.description}
                  onChange={handleChange}
                  placeholder="Battery purchase payment"
                  required
                />
              </label>

              <label className="full-collection-field">
                Amount (₹)
                <input
                  name="amount"
                  type="number"
                  min="1"
                  step="0.01"
                  value={form.amount}
                  onChange={handleChange}
                  required
                />
              </label>
            </div>

            <button
              className="create-payment-link-button"
              type="submit"
              disabled={isSubmitting}
            >
              {isSubmitting
                ? "Creating Secure Link..."
                : "Create & Send Payment Link"}
            </button>

            <p className="collection-test-note">
              Razorpay Test Mode is active. Test links do not collect
              real money.
            </p>
          </form>

          <aside className="latest-payment-link">
            <p>LATEST PAYMENT LINK</p>

            {createdRequest ? (
              <>
                <span className="latest-link-icon">🔗</span>
                <h2>{createdRequest.customerName}</h2>
                <strong>
                  ₹{createdRequest.amount.toLocaleString("en-IN")}
                </strong>
                <small>{createdRequest.referenceNumber}</small>

                <PaymentQrCode
                  paymentRequest={createdRequest}
                  compact
                />

                <a
                  href={createdRequest.shortUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  {createdRequest.shortUrl}
                </a>

                <button
                  type="button"
                  onClick={() =>
                    copyPaymentLink(createdRequest.shortUrl)
                  }
                >
                  Copy Payment Link
                </button>
              </>
            ) : (
              <div className="no-latest-link">
                <span>🔗</span>
                <h3>No link created yet</h3>
                <p>Your newest payment link will appear here.</p>
              </div>
            )}
          </aside>
        </section>

        <section className="customer-payment-history">
          <div className="collection-section-heading">
            <p>PAYMENT REQUESTS</p>
            <h2>Customer Collection History</h2>
            <span>Status refreshes automatically every 15 seconds.</span>
          </div>

          {isLoading ? (
            <div className="empty-collection-state">
              Loading customer payments...
            </div>
          ) : errorMessage ? (
            <div className="empty-collection-state">
              {errorMessage}
            </div>
          ) : paymentRequests.length === 0 ? (
            <div className="empty-collection-state">
              No customer payment links are available.
            </div>
          ) : (
            <div className="customer-payment-cards">
              {paymentRequests.map((paymentRequest) => (
                <article
                  className="customer-payment-card"
                  key={paymentRequest.id}
                >
                  <header>
                    <div>
                      <small>REFERENCE</small>
                      <strong>
                        {paymentRequest.referenceNumber}
                      </strong>
                    </div>

                    <span
                      className={`collection-status ${paymentRequest.status.toLowerCase()}`}
                    >
                      {paymentRequest.status}
                    </span>
                  </header>

                  <div className="customer-payment-information">
                    <div>
                      <small>Customer</small>
                      <strong>{paymentRequest.customerName}</strong>
                      <span>
                        {paymentRequest.customerPhone ||
                          paymentRequest.customerEmail}
                      </span>
                    </div>

                    <div>
                      <small>Invoice</small>
                      <strong>
                        {paymentRequest.invoiceNumber || "Not provided"}
                      </strong>
                    </div>

                    <div>
                      <small>Amount</small>
                      <strong className="collection-amount">
                        ₹
                        {paymentRequest.amount.toLocaleString(
                          "en-IN",
                        )}
                      </strong>
                    </div>
                  </div>

                  <footer>
                    <button
                      type="button"
                      onClick={() =>
                        setQrPaymentRequest(paymentRequest)
                      }
                    >
                      Show QR
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        copyPaymentLink(paymentRequest.shortUrl)
                      }
                    >
                      Copy Link
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        shareOnWhatsApp(paymentRequest)
                      }
                    >
                      Share on WhatsApp
                    </button>

                    <a
                      href={paymentRequest.shortUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Open Link
                    </a>
                  </footer>
                </article>
              ))}
            </div>
          )}
        </section>

        {qrPaymentRequest ? (
          <div
            className="payment-qr-modal"
            role="presentation"
            onClick={() => setQrPaymentRequest(null)}
          >
            <section
              role="dialog"
              aria-modal="true"
              aria-labelledby="payment-qr-title"
              onClick={(event) => event.stopPropagation()}
            >
              <button
                className="close-payment-qr"
                type="button"
                aria-label="Close QR code"
                onClick={() => setQrPaymentRequest(null)}
              >
                ×
              </button>

              <p>VOLTCORE CUSTOMER PAYMENT</p>
              <h2 id="payment-qr-title">
                {qrPaymentRequest.customerName}
              </h2>
              <strong>
                ₹{qrPaymentRequest.amount.toLocaleString("en-IN")}
              </strong>
              <small>{qrPaymentRequest.referenceNumber}</small>

              <PaymentQrCode paymentRequest={qrPaymentRequest} />

              <button
                className="copy-qr-payment-link"
                type="button"
                onClick={() =>
                  copyPaymentLink(qrPaymentRequest.shortUrl)
                }
              >
                Copy Payment Link
              </button>
            </section>
          </div>
        ) : null}
      </main>
    </div>
  );
}

export default CustomerPaymentsPage;
