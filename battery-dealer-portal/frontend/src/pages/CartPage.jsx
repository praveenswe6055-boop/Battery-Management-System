import { useState } from "react";
import { useNavigate } from "react-router-dom";
import PortalSidebar from "../components/PortalSidebar";
import "./CartPage.css";

function CartPage() {
  const navigate = useNavigate();

  const [cart, setCart] = useState(() =>
    JSON.parse(localStorage.getItem("dealerDemoCart") || "[]"),
  );

  function saveCart(updatedCart) {
    setCart(updatedCart);

    localStorage.setItem(
      "dealerDemoCart",
      JSON.stringify(updatedCart),
    );
  }

  function increaseQuantity(productId) {
    const updatedCart = cart.map((item) =>
      item.id === productId
        ? { ...item, quantity: item.quantity + 1 }
        : item,
    );

    saveCart(updatedCart);
  }

  function decreaseQuantity(productId) {
    const updatedCart = cart.map((item) =>
      item.id === productId
        ? {
            ...item,
            quantity: Math.max(1, item.quantity - 1),
          }
        : item,
    );

    saveCart(updatedCart);
  }

  function removeItem(productId) {
    const updatedCart = cart.filter(
      (item) => item.id !== productId,
    );

    saveCart(updatedCart);
  }

  const subtotal = cart.reduce(
    (total, item) => total + item.price * item.quantity,
    0,
  );

  const tax = Math.round(subtotal * 0.18);
  const finalTotal = subtotal + tax;

  return (
    <div className="dashboard-layout">
      <PortalSidebar />

      <main className="dashboard-main">
        <header className="cart-header">
          <div>
            <p className="dashboard-eyebrow">DEALER CART</p>
            <h1>Your Cart</h1>
            <p>Review quantities and order values.</p>
          </div>

          <button
            type="button"
            onClick={() => navigate("/products")}
          >
            Continue shopping
          </button>
        </header>

        {cart.length === 0 ? (
          <section className="empty-cart">
            <span>🛒</span>
            <h2>Your cart is empty</h2>
            <p>Add a battery from the product catalogue.</p>

            <button
              type="button"
              onClick={() => navigate("/products")}
            >
              Browse batteries
            </button>
          </section>
        ) : (
          <div className="cart-layout">
            <section className="cart-items">
              {cart.map((item) => (
                <article className="cart-item" key={item.id}>
                  <div className="cart-product-image">
                    <img src={item.image} alt={item.name} />
                  </div>

                  <div className="cart-product-details">
                    <p>{item.code}</p>
                    <h2>{item.name}</h2>

                    <span>
                      {item.capacity} · {item.voltage}
                    </span>

                    <strong>
                      ₹{item.price.toLocaleString("en-IN")}
                    </strong>
                  </div>

                  <div className="quantity-control">
                    <button
                      type="button"
                      onClick={() => decreaseQuantity(item.id)}
                    >
                      −
                    </button>

                    <span>{item.quantity}</span>

                    <button
                      type="button"
                      onClick={() => increaseQuantity(item.id)}
                    >
                      +
                    </button>
                  </div>

                  <div className="cart-item-total">
                    <strong>
                      ₹
                      {(
                        item.price * item.quantity
                      ).toLocaleString("en-IN")}
                    </strong>

                    <button
                      type="button"
                      onClick={() => removeItem(item.id)}
                    >
                      Remove
                    </button>
                  </div>
                </article>
              ))}
            </section>

            <aside className="order-summary">
              <h2>Order Summary</h2>

              <div>
                <span>Subtotal</span>
                <strong>
                  ₹{subtotal.toLocaleString("en-IN")}
                </strong>
              </div>

              <div>
                <span>GST (18%)</span>
                <strong>₹{tax.toLocaleString("en-IN")}</strong>
              </div>

              <div>
                <span>Delivery</span>
                <strong>Free</strong>
              </div>

              <div className="summary-total">
                <span>Total</span>
                <strong>
                  ₹{finalTotal.toLocaleString("en-IN")}
                </strong>
              </div>

              <button
                className="checkout-button"
                type="button"
                onClick={() => navigate("/checkout")}
                
              >
                Continue to checkout
              </button>
            </aside>
          </div>
        )}
      </main>
    </div>
  );
}

export default CartPage;