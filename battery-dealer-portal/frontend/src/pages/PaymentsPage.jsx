import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import PortalSidebar from "../components/PortalSidebar";
import "./PaymentsPage.css";

function loadRazorpayScript() {
  return new Promise((resolve) => {
    if (window.Razorpay) {
      resolve(true);
      return;
    }

    const existingScript = document.getElementById(
      "razorpay-checkout-script",
    );

    if (existingScript) {
      existingScript.addEventListener(
        "load",
        () => resolve(true),
        { once: true },
      );
      existingScript.addEventListener(
        "error",
        () => resolve(false),
        { once: true },
      );
      return;
    }

    const script = document.createElement("script");
    script.id = "razorpay-checkout-script";
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

function PaymentsPage() {
  const navigate = useNavigate();

  const [orders, setOrders] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [payingOrderNumber, setPayingOrderNumber] =
    useState("");

  async function loadPayments() {
    try {
      setErrorMessage("");

      const response = await fetch(
        "http://localhost:3000/api/payments",
        {
          credentials: "include",
        },
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.message || "Unable to load payments.",
        );
      }

      setOrders(data.orders);
    } catch (error) {
      setErrorMessage(error.message);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadPayments();
  }, []);

  const pendingOrders = orders.filter(
    (order) => order.paymentStatus !== "Paid",
  );

  const paidOrders = orders.filter(
    (order) => order.paymentStatus === "Paid",
  );

  const totalOutstanding = pendingOrders.reduce(
    (total, order) => total + order.total,
    0,
  );

  async function handlePayment(orderNumber) {
    const paymentConfirmed = window.confirm(
      `Continue with Razorpay payment for ${orderNumber}?`,
    );

    if (!paymentConfirmed) {
      return;
    }

    try {
      setPayingOrderNumber(orderNumber);

      const scriptLoaded = await loadRazorpayScript();

      if (!scriptLoaded) {
        throw new Error(
          "Unable to load Razorpay Checkout.",
        );
      }

      const createResponse = await fetch(
        "http://localhost:3000/api/payments/create-order",
        {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ orderNumber }),
        },
      );

      const paymentOrder = await createResponse.json();

      if (!createResponse.ok) {
        throw new Error(
          paymentOrder.message ||
            "Unable to start the payment.",
        );
      }

      const checkout = new window.Razorpay({
        key: paymentOrder.keyId,
        amount: paymentOrder.amount,
        currency: paymentOrder.currency,
        name: paymentOrder.companyName,
        description: paymentOrder.description,
        order_id: paymentOrder.razorpayOrderId,
        prefill: {
          name: paymentOrder.customer.name,
          email: paymentOrder.customer.email,
        },
        theme: {
          color: "#67e800",
        },
        modal: {
          ondismiss: () => setPayingOrderNumber(""),
        },
        handler: async (paymentResult) => {
          try {
            const verifyResponse = await fetch(
              "http://localhost:3000/api/payments/verify",
              {
                method: "POST",
                credentials: "include",
                headers: {
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  orderNumber,
                  razorpayOrderId:
                    paymentResult.razorpay_order_id,
                  razorpayPaymentId:
                    paymentResult.razorpay_payment_id,
                  razorpaySignature:
                    paymentResult.razorpay_signature,
                }),
              },
            );

            const verification = await verifyResponse.json();

            if (!verifyResponse.ok) {
              throw new Error(
                verification.message ||
                  "Payment verification failed.",
              );
            }

            alert("Razorpay payment completed successfully.");
            await loadPayments();
          } catch (error) {
            alert(error.message);
          } finally {
            setPayingOrderNumber("");
          }
        },
      });

      checkout.on("payment.failed", (failure) => {
        alert(
          failure.error?.description || "Razorpay payment failed.",
        );
        setPayingOrderNumber("");
      });

      checkout.open();
    } catch (error) {
      alert(error.message);
      setPayingOrderNumber("");
    }
  }

  return (
    <div className="dashboard-layout">
      <PortalSidebar />

      <main className="dashboard-main">
        <header className="payments-header">
          <div>
            <p className="dashboard-eyebrow">
              DEALER PAYMENTS
            </p>

            <h1>Payments</h1>

            <p>
              View outstanding balances and payment history.
            </p>
          </div>

          <button
            type="button"
            onClick={() => navigate("/orders")}
          >
            View My Orders
          </button>
        </header>

        {isLoading && (
          <div className="no-payments">Loading payments...</div>
        )}

        {errorMessage && (
          <div className="no-payments">{errorMessage}</div>
        )}

        <section className="payment-overview">
          <article>
            <span>₹</span>

            <div>
              <small>Total Outstanding</small>
              <strong>
                ₹
                {totalOutstanding.toLocaleString("en-IN")}
              </strong>
            </div>
          </article>

          <article>
            <span>⌛</span>

            <div>
              <small>Pending Payments</small>
              <strong>{pendingOrders.length}</strong>
            </div>
          </article>

          <article>
            <span>✓</span>

            <div>
              <small>Completed Payments</small>
              <strong>{paidOrders.length}</strong>
            </div>
          </article>
        </section>

        <section className="payments-section">
          <div className="payments-section-heading">
            <div>
              <h2>Outstanding Payments</h2>

              <p>
                Select an order to complete its payment.
              </p>
            </div>
          </div>

          {pendingOrders.length === 0 ? (
            <div className="no-payments">
              <span>✓</span>
              <h3>No outstanding payments</h3>
              <p>All your orders are fully paid.</p>
            </div>
          ) : (
            <div className="pending-payments-list">
              {pendingOrders.map((order) => (
                <article
                  className="pending-payment-card"
                  key={order.orderNumber}
                >
                  <div>
                    <small>ORDER NUMBER</small>
                    <strong>{order.orderNumber}</strong>
                  </div>

                  <div>
                    <small>ORDER DATE</small>
                    <strong>{order.orderDate}</strong>
                  </div>

                  <div>
                    <small>PAYMENT STATUS</small>

                    <strong className="pending-label">
                      {order.paymentStatus}
                    </strong>
                  </div>

                  <div>
                    <small>AMOUNT DUE</small>

                    <strong className="amount-due">
                      ₹
                      {order.total.toLocaleString("en-IN")}
                    </strong>
                  </div>

                  <button
                    type="button"
                    disabled={
                      payingOrderNumber === order.orderNumber
                    }
                    onClick={() =>
                      handlePayment(order.orderNumber)
                    }
                  >
                    {payingOrderNumber === order.orderNumber
                      ? "Opening Razorpay..."
                      : "Pay with Razorpay"}
                  </button>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="payments-section">
          <div className="payments-section-heading">
            <div>
              <h2>Payment History</h2>
              <p>Your successfully completed payments.</p>
            </div>
          </div>

          {paidOrders.length === 0 ? (
            <div className="empty-payment-history">
              No completed payments are available.
            </div>
          ) : (
            <div className="payment-table-wrapper">
              <table className="payment-table">
                <thead>
                  <tr>
                    <th>Order Number</th>
                    <th>Paid Date</th>
                    <th>Method</th>
                    <th>Amount</th>
                    <th>Status</th>
                  </tr>
                </thead>

                <tbody>
                  {paidOrders.map((order) => (
                    <tr key={order.orderNumber}>
                      <td>{order.orderNumber}</td>

                      <td>
                        {order.paidDate || order.orderDate}
                      </td>

                      <td>
                        {order.paymentMethod || "Razorpay"}
                      </td>

                      <td>
                        ₹
                        {order.total.toLocaleString("en-IN")}
                      </td>

                      <td>
                        <span className="paid-label">
                          Paid
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <p className="payment-demo-note">
          Razorpay is currently running in Test Mode. No real money
          will be charged while Test Mode keys are configured.
        </p>
      </main>
    </div>
  );
}

export default PaymentsPage;
