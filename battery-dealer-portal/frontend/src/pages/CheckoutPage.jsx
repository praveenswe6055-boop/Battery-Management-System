import { useState } from "react";
import { useNavigate } from "react-router-dom";
import PortalSidebar from "../components/PortalSidebar";
import { apiUrl } from "../config/api";
import "./CheckoutPage.css";

function CheckoutPage() {
  const navigate = useNavigate();

  const [cart, setCart] = useState(() =>
    JSON.parse(localStorage.getItem("dealerDemoCart") || "[]"),
  );

  const [form, setForm] = useState({
    companyName: "Demo Dealer",
    contactName: "",
    phone: "",
    address: "",
    city: "",
    state: "",
    pincode: "",
    paymentMethod: "pay-later",
  });

  const [orderNumber, setOrderNumber] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const subtotal = cart.reduce(
    (total, item) => total + item.price * item.quantity,
    0,
  );

  const gst = Math.round(subtotal * 0.18);
  const finalTotal = subtotal + gst;

  function handleChange(event) {
    setForm({
      ...form,
      [event.target.name]: event.target.value,
    });
  }
  function removeCheckoutItem(productId) {
  const updatedCart = cart.filter(
    (item) => item.id !== productId,
  );

  setCart(updatedCart);

  localStorage.setItem(
    "dealerDemoCart",
    JSON.stringify(updatedCart),
  );

  if (updatedCart.length === 0) {
    navigate("/cart");
  }
}

  async function handleSubmit(event) {
    event.preventDefault();

    if (cart.length === 0) {
      alert("Your cart is empty.");
      return;
    }

    try {
      setIsSubmitting(true);

      const response = await fetch(
        apiUrl("/api/orders"),
        {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            delivery: form,
            paymentMethod: form.paymentMethod,
            items: cart.map((item) => ({
              productId: item.id,
              quantity: item.quantity,
            })),
          }),
        },
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.message || "Unable to create the order.",
        );
      }

      localStorage.removeItem("dealerDemoCart");
      setCart([]);
      setOrderNumber(data.order.orderNumber);
    } catch (error) {
      alert(error.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  if (orderNumber) {
    return (
      <div className="dashboard-layout">
        <PortalSidebar />

        <main className="dashboard-main">
          <section className="order-success">
            <span>✓</span>
            <p>ORDER CONFIRMED</p>
            <h1>Thank you for your order</h1>

            <h2>{orderNumber}</h2>

            <p>
              Your battery order was successfully created.
            </p>

            <div>
              <button
                type="button"
                onClick={() => navigate("/dashboard")}
              >
                Go to Dashboard
              </button>

              <button
                type="button"
                onClick={() => navigate("/products")}
              >
                Continue Shopping
              </button>
            </div>
          </section>
        </main>
      </div>
    );
  }

  return (
    <div className="dashboard-layout">
      <PortalSidebar />

      <main className="dashboard-main">
        <header className="checkout-header">
          <div>
            <p className="dashboard-eyebrow">SECURE CHECKOUT</p>
            <h1>Complete Your Order</h1>
            <p>
              Confirm the delivery and payment information.
            </p>
          </div>

          <button
            type="button"
            onClick={() => navigate("/cart")}
          >
            Back to Cart
          </button>
        </header>

        <form
          className="checkout-layout"
          onSubmit={handleSubmit}
        >
          <section className="checkout-form">
            <h2>Delivery Information</h2>

            <div className="checkout-fields">
              <label>
                Company Name
                <input
                  name="companyName"
                  value={form.companyName}
                  onChange={handleChange}
                  required
                />
              </label>

              <label>
                Contact Person
                <input
                  name="contactName"
                  value={form.contactName}
                  onChange={handleChange}
                  required
                />
              </label>

              <label>
                Phone Number
                <input
                  name="phone"
                  type="tel"
                  value={form.phone}
                  onChange={handleChange}
                  required
                />
              </label>

              <label className="full-field">
                Delivery Address
                <textarea
                  name="address"
                  value={form.address}
                  onChange={handleChange}
                  required
                />
              </label>

              <label>
                City
                <input
                  name="city"
                  value={form.city}
                  onChange={handleChange}
                  required
                />
              </label>

              <label>
                State
                <input
                  name="state"
                  value={form.state}
                  onChange={handleChange}
                  required
                />
              </label>

              <label>
                PIN Code
                <input
                  name="pincode"
                  value={form.pincode}
                  onChange={handleChange}
                  required
                />
              </label>
            </div>

            <h2 className="payment-heading">
              Payment Method
            </h2>

            <label className="payment-option">
              <input
                type="radio"
                name="paymentMethod"
                value="pay-later"
                checked={
                  form.paymentMethod === "pay-later"
                }
                onChange={handleChange}
              />

              <span>
                <strong>Dealer Credit / Pay Later</strong>
                <small>
                  Payment will be collected according to your
                  dealer credit terms.
                </small>
              </span>
            </label>

            <label className="payment-option">
              <input
                type="radio"
                name="paymentMethod"
                value="razorpay"
                checked={
                  form.paymentMethod === "razorpay"
                }
                onChange={handleChange}
              />

              <span>
                <strong>Razorpay Online Payment</strong>
                <small>
                  Online payment will be connected during the
                  backend integration.
                </small>
              </span>
            </label>
          </section>

          <aside className="checkout-summary">
            <h2>Order Summary</h2>

            {cart.map((item) => (
              <div className="checkout-item" key={item.id}>
                <img src={item.image} alt={item.name} />

                <div>
                  <strong>{item.name}</strong>
                  <small>Quantity: {item.quantity}</small>
                </div>

                <div className="checkout-item-actions">
  <span>
    ₹
    {(
      item.price * item.quantity
    ).toLocaleString("en-IN")}
  </span>

  <button
    type="button"
    onClick={() => removeCheckoutItem(item.id)}
  >
    Remove
  </button>
</div>
              </div>
            ))}

            <div className="checkout-price">
              <span>Subtotal</span>
              <strong>
                ₹{subtotal.toLocaleString("en-IN")}
              </strong>
            </div>

            <div className="checkout-price">
              <span>GST (18%)</span>
              <strong>₹{gst.toLocaleString("en-IN")}</strong>
            </div>

            <div className="checkout-price checkout-total">
              <span>Total</span>
              <strong>
                ₹{finalTotal.toLocaleString("en-IN")}
              </strong>
            </div>

            <button
              className="place-order-button"
              type="submit"
              disabled={isSubmitting}
            >
              {isSubmitting ? "Placing Order..." : "Place Order"}
            </button>
          </aside>
        </form>
      </main>
    </div>
  );
}

export default CheckoutPage;
