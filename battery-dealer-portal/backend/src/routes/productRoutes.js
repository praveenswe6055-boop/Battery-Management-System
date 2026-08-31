const express = require("express");
const database = require("../config/database");

const router = express.Router();

router.get("/", async (request, response, next) => {
  try {
    if (!request.session?.user) {
      return response.status(401).json({
        message: "Authentication required.",
      });
    }

    const [products] = await database.execute(`
      SELECT
        id,
        product_code AS code,
        product_name AS name,
        category,
        capacity_ah AS capacityAh,
        voltage_v AS voltage,
        warranty_months AS warrantyMonths,
        dealer_price AS price,
        stock_quantity AS stock,
        image_url AS image
      FROM products
      WHERE status = 'ACTIVE'
      ORDER BY id
    `);

    const formattedProducts = products.map((product) => ({
      ...product,
      price: Number(product.price),
    }));

    return response.status(200).json({
      products: formattedProducts,
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;