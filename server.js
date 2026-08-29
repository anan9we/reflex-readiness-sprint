const express = require("express");
const sqlite3 = require("sqlite3").verbose();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static("public"));

// ----------------------------------
// Database
// ----------------------------------

const db = new sqlite3.Database("./reflex.db");

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS riders (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      phone TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS deliveries (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL UNIQUE,
      customer_name TEXT NOT NULL,
      customer_phone TEXT NOT NULL,
      address TEXT NOT NULL,
      item_description TEXT NOT NULL,
      status TEXT NOT NULL,
      rider_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (rider_id) REFERENCES riders(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS delivery_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      delivery_id TEXT NOT NULL,
      order_id TEXT NOT NULL,
      old_status TEXT,
      new_status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (delivery_id) REFERENCES deliveries(id)
    )
  `);

  // Add sample riders if they don't exist

  const riders = [
    ["R001", "Kevin", "0712345678"],
    ["R002", "Brian", "0723456789"],
    ["R003", "David", "0734567890"],
  ];

  const statement = db.prepare(`
    INSERT OR IGNORE INTO riders
    (id, name, phone, active)
    VALUES (?, ?, ?, 1)
  `);

  riders.forEach((rider) => {
    statement.run(rider);
  });

  statement.finalize();
});

// ----------------------------------
// Status rules
// ----------------------------------

const allowedTransitions = {
  OPEN: ["ASSIGNED"],
  ASSIGNED: ["PICKED_UP"],
  PICKED_UP: ["DELIVERED"],
  DELIVERED: [],
};

// ----------------------------------
// Health check
// ----------------------------------

app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    message: "Reflex API is running",
  });
});

// ----------------------------------
// Get riders
// ----------------------------------

app.get("/api/riders", (req, res) => {
  db.all(`SELECT id, name, phone, active FROM riders`, [], (error, rows) => {
    if (error) {
      console.error(error);

      return res.status(500).json({
        error: "Unable to retrieve riders",
      });
    }

    res.json(rows);
  });
});

// ----------------------------------
// Get all deliveries
// ----------------------------------

app.get("/api/deliveries", (req, res) => {
  const query = `
    SELECT
      id,
      order_id AS orderId,
      customer_name AS customerName,
      customer_phone AS customerPhone,
      address,
      item_description AS itemDescription,
      status,
      rider_id AS riderId,
      created_at AS createdAt,
      updated_at AS updatedAt
    FROM deliveries
    ORDER BY created_at DESC
  `;

  db.all(query, [], (error, rows) => {
    if (error) {
      console.error(error);

      return res.status(500).json({
        error: "Unable to retrieve deliveries",
      });
    }

    res.json(rows);
  });
});

// ----------------------------------
// Create delivery
// ----------------------------------

app.post("/api/deliveries", (req, res) => {
  const { orderId, customerName, customerPhone, address, itemDescription } =
    req.body;

  if (
    !orderId ||
    !customerName ||
    !customerPhone ||
    !address ||
    !itemDescription
  ) {
    return res.status(400).json({
      error:
        "Order ID, customer name, phone, address, and item description are required.",
    });
  }

  const deliveryId = `D${Date.now()}`;
  const now = new Date().toISOString();

  const query = `
    INSERT INTO deliveries (
      id,
      order_id,
      customer_name,
      customer_phone,
      address,
      item_description,
      status,
      rider_id,
      created_at,
      updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  db.run(
    query,
    [
      deliveryId,
      orderId,
      customerName,
      customerPhone,
      address,
      itemDescription,
      "OPEN",
      null,
      now,
      now,
    ],
    function (error) {
      if (error) {
        console.error(error);

        return res.status(500).json({
          error: "Unable to create delivery",
        });
      }

      // FIXED:
      // order_id is now included because delivery_events requires it.

      db.run(
        `
          INSERT INTO delivery_events
          (delivery_id, order_id, old_status, new_status, created_at)
          VALUES (?, ?, ?, ?, ?)
        `,
        [deliveryId, orderId, null, "OPEN", now],
      );

      res.status(201).json({
        message: "Delivery request created",

        delivery: {
          id: deliveryId,
          orderId,
          customerName,
          customerPhone,
          address,
          itemDescription,
          status: "OPEN",
          riderId: null,
          createdAt: now,
          updatedAt: now,
        },
      });
    },
  );
});

// ----------------------------------
// Assign delivery
// ----------------------------------

app.post("/api/deliveries/:deliveryId/assign", (req, res) => {
  const { deliveryId } = req.params;
  const { riderId } = req.body;

  if (!riderId) {
    return res.status(400).json({
      error: "Rider ID is required.",
    });
  }

  db.get(
    `SELECT * FROM deliveries WHERE id = ?`,
    [deliveryId],
    (error, delivery) => {
      if (error) {
        console.error(error);

        return res.status(500).json({
          error: "Unable to find delivery.",
        });
      }

      if (!delivery) {
        return res.status(404).json({
          error: "Delivery not found.",
        });
      }

      if (delivery.status !== "OPEN") {
        return res.status(409).json({
          error: `Cannot assign delivery because its status is ${delivery.status}.`,
        });
      }

      db.get(
        `SELECT * FROM riders WHERE id = ? AND active = 1`,
        [riderId],
        (error, rider) => {
          if (error) {
            console.error(error);

            return res.status(500).json({
              error: "Unable to find rider.",
            });
          }

          if (!rider) {
            return res.status(404).json({
              error: "Rider not found or inactive.",
            });
          }

          const now = new Date().toISOString();

          db.run(
            `
              UPDATE deliveries

              SET
                rider_id = ?,
                status = ?,
                updated_at = ?

              WHERE id = ?
                AND status = ?
            `,
            [riderId, "ASSIGNED", now, deliveryId, "OPEN"],
            function (error) {
              if (error) {
                console.error(error);

                return res.status(500).json({
                  error: "Unable to assign delivery.",
                });
              }

              if (this.changes === 0) {
                return res.status(409).json({
                  error: "Delivery was already updated.",
                });
              }

              db.run(
                `
                  INSERT INTO delivery_events
                  (delivery_id, order_id, old_status, new_status, created_at)
                  VALUES (?, ?, ?, ?, ?)
                `,
                [
                  deliveryId,
                  delivery.order_id,
                  delivery.status,
                  "ASSIGNED",
                  now,
                ],
                (eventError) => {
                  if (eventError) {
                    console.error(eventError);
                  }

                  db.get(
                    `
                      SELECT
                        id,
                        order_id AS orderId,
                        customer_name AS customerName,
                        customer_phone AS customerPhone,
                        address,
                        item_description AS itemDescription,
                        status,
                        rider_id AS riderId,
                        created_at AS createdAt,
                        updated_at AS updatedAt
                      FROM deliveries
                      WHERE id = ?
                    `,
                    [deliveryId],
                    (error, updatedDelivery) => {
                      if (error) {
                        console.error(error);

                        return res.status(500).json({
                          error: "Unable to retrieve updated delivery.",
                        });
                      }

                      res.json({
                        message: "Delivery assigned successfully.",
                        delivery: updatedDelivery,
                      });
                    },
                  );
                },
              );
            },
          );
        },
      );
    },
  );
});

// ----------------------------------
// Update delivery status
// ----------------------------------

app.patch("/api/deliveries/:deliveryId/status", (req, res) => {
  const { deliveryId } = req.params;
  const { status } = req.body;

  db.get(
    `SELECT * FROM deliveries WHERE id = ?`,
    [deliveryId],
    (error, delivery) => {
      if (error) {
        console.error(error);

        return res.status(500).json({
          error: "Unable to find delivery",
        });
      }

      if (!delivery) {
        return res.status(404).json({
          error: "Delivery not found",
        });
      }

      if (
        !allowedTransitions[delivery.status] ||
        !allowedTransitions[delivery.status].includes(status)
      ) {
        return res.status(409).json({
          error: `Cannot change delivery from ${delivery.status} to ${status}.`,
        });
      }

      const now = new Date().toISOString();

      db.run(
        `
          UPDATE deliveries

          SET
            status = ?,
            updated_at = ?

          WHERE id = ?
            AND status = ?
        `,
        [status, now, deliveryId, delivery.status],
        function (error) {
          if (error) {
            console.error(error);

            return res.status(500).json({
              error: "Unable to update delivery status",
            });
          }

          if (this.changes === 0) {
            return res.status(409).json({
              error: "Delivery status changed before this update was applied.",
            });
          }

          // FIXED:
          // Added order_id to the event insert.

          db.run(
            `
              INSERT INTO delivery_events
              (delivery_id, order_id, old_status, new_status, created_at)
              VALUES (?, ?, ?, ?, ?)
            `,
            [deliveryId, delivery.order_id, delivery.status, status, now],
          );

          db.get(
            `
              SELECT
                id,
                order_id AS orderId,
                customer_name AS customerName,
                customer_phone AS customerPhone,
                address,
                item_description AS itemDescription,
                status,
                rider_id AS riderId,
                created_at AS createdAt,
                updated_at AS updatedAt
              FROM deliveries
              WHERE id = ?
            `,
            [deliveryId],
            (error, updatedDelivery) => {
              if (error) {
                return res.status(500).json({
                  error: "Unable to retrieve updated delivery",
                });
              }

              res.json({
                message: "Delivery status updated",

                delivery: updatedDelivery,
              });
            },
          );
        },
      );
    },
  );
});

// ----------------------------------
// Get one delivery
// ----------------------------------

app.get("/api/deliveries/:deliveryId", (req, res) => {
  const { deliveryId } = req.params;

  db.get(
    `
      SELECT
        id,
        order_id AS orderId,
        customer_name AS customerName,
        customer_phone AS customerPhone,
        address,
        item_description AS itemDescription,
        status,
        rider_id AS riderId,
        created_at AS createdAt,
        updated_at AS updatedAt
      FROM deliveries
      WHERE id = ?
    `,
    [deliveryId],
    (error, delivery) => {
      if (error) {
        console.error(error);

        return res.status(500).json({
          error: "Unable to retrieve delivery",
        });
      }

      if (!delivery) {
        return res.status(404).json({
          error: "Delivery not found",
        });
      }

      res.json(delivery);
    },
  );
});

// ----------------------------------
// Search delivery history
// ----------------------------------

app.get("/api/history", (req, res) => {
  const search = (req.query.search || "").trim();

  let query = `
    SELECT
      d.id,
      d.order_id AS orderId,
      d.customer_name AS customerName,
      d.customer_phone AS customerPhone,
      d.address,
      d.item_description AS itemDescription,
      d.status,
      d.rider_id AS riderId,
      d.created_at AS createdAt,
      d.updated_at AS updatedAt
    FROM deliveries d
  `;

  const params = [];

  if (search) {
    query += `
      WHERE
        d.order_id LIKE ?
        OR d.id LIKE ?
        OR d.customer_name LIKE ?
        OR d.customer_phone LIKE ?
    `;

    const term = `%${search}%`;

    params.push(term, term, term, term);
  }

  query += `
    ORDER BY d.created_at DESC
  `;

  db.all(query, params, (error, rows) => {
    if (error) {
      console.error(error);

      return res.status(500).json({
        error: "Unable to retrieve delivery history",
      });
    }

    res.json(rows);
  });
});

// ----------------------------------
// Start server
// ----------------------------------

app.listen(PORT, () => {
  console.log("=================================");
  console.log("       REFLEX DELIVERY SYSTEM");
  console.log("=================================");
  console.log(`Server running on http://localhost:${PORT}`);
  console.log("Database: reflex.db");
});

app.delete("/api/admin/clear-database", (req, res) => {
  db.serialize(() => {
    db.run(`DELETE FROM delivery_events`, (error) => {
      if (error) {
        console.error(error);
        return res.status(500).json({
          error: "Unable to clear delivery events",
        });
      }

      db.run(`DELETE FROM deliveries`, (error) => {
        if (error) {
          console.error(error);
          return res.status(500).json({
            error: "Unable to clear deliveries",
          });
        }

        res.json({
          message: "Database cleared successfully",
        });
      });
    });
  });
});
