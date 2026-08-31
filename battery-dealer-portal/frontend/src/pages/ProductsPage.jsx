import { useEffect, useState } from "react";
import PortalSidebar from "../components/PortalSidebar";
import "./ProductsPage.css";

function ProductsPage() {
  const [search, setSearch] = useState("");
  const [batteries, setBatteries] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    async function loadProducts() {
      try {
        const response = await fetch(
          "http://localhost:3000/api/products",
          {
            credentials: "include",
          },
        );

        const data = await response.json();

        if (!response.ok) {
          throw new Error(
            data.message || "Unable to load products.",
          );
        }

        const formattedProducts = data.products.map((product) => ({
          ...product,
          capacity: `${product.capacityAh} Ah`,
          voltage: `${product.voltage} V`,
          warranty: `${product.warrantyMonths} months`,
        }));

        setBatteries(formattedProducts);
      } catch (error) {
        setErrorMessage(error.message);
      } finally {
        setIsLoading(false);
      }
    }

    loadProducts();
  }, []);

  const filteredBatteries = batteries.filter((battery) => {
    const value = search.toLowerCase();

    return (
      battery.name.toLowerCase().includes(value) ||
      battery.code.toLowerCase().includes(value)
    );
  });

  function handleAddToCart(selectedBattery) {
    const existingCart = JSON.parse(
      localStorage.getItem("dealerDemoCart") || "[]",
    );

    const existingItem = existingCart.find(
      (item) => String(item.id) === String(selectedBattery.id),
    );

    let updatedCart;

    if (existingItem) {
      updatedCart = existingCart.map((item) =>
        String(item.id) === String(selectedBattery.id)
          ? { ...item, quantity: item.quantity + 1 }
          : item,
      );
    } else {
      updatedCart = [
        ...existingCart,
        {
          ...selectedBattery,
          quantity: 1,
        },
      ];
    }

    localStorage.setItem(
      "dealerDemoCart",
      JSON.stringify(updatedCart),
    );

    alert(`${selectedBattery.name} added to cart.`);
  }

  return (
    <div className="dashboard-layout">
      <PortalSidebar />

      <main className="dashboard-main">
        <header className="products-header">
          <div>
            <p className="dashboard-eyebrow">PRODUCT CATALOGUE</p>
            <h1>Available Batteries</h1>
            <p>Browse products, inventory and dealer prices.</p>
          </div>

          <input
            type="search"
            placeholder="Search by product or code"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </header>

        {isLoading && (
          <div className="empty-products">Loading batteries...</div>
        )}

        {errorMessage && (
          <div className="empty-products">{errorMessage}</div>
        )}

        <section className="product-grid">
          {!isLoading &&
            !errorMessage &&
            filteredBatteries.map((battery) => (
            <article className="product-card" key={battery.id}>
              <div className="product-image">
                <img
                  src={battery.image}
                  alt={`${battery.name} product`}
                />

                <div className="stock-badge">
                  {battery.stock} available
                </div>
              </div>

              <div className="product-content">
                <p className="product-code">{battery.code}</p>
                <h2>{battery.name}</h2>

                <div className="product-specifications">
                  <span>{battery.capacity}</span>
                  <span>{battery.voltage}</span>
                  <span>{battery.warranty}</span>
                </div>

                <div className="product-footer">
                  <div>
                    <small>Dealer price</small>

                    <strong>
                      ₹{battery.price.toLocaleString("en-IN")}
                    </strong>
                  </div>

                  <button
  className="add-to-cart-button"
  type="button"
  aria-label={`Add ${battery.name} to cart`}
  onClick={() => handleAddToCart(battery)}
>
  <span aria-hidden="true">+</span>
  Add to cart
</button>
                </div>
              </div>
            </article>
            ))}
        </section>

        {!isLoading &&
          !errorMessage &&
          filteredBatteries.length === 0 && (
          <div className="empty-products">
            No batteries match your search.
          </div>
        )}
      </main>
    </div>
  );
}

export default ProductsPage;
