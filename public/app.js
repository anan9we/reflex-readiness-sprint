const deliveryForm = document.getElementById("deliveryForm");
const deliveryList = document.getElementById("deliveryList");
const riderDeliveries = document.getElementById("riderDeliveries");
const riderSelector = document.getElementById("riderSelector");
const formMessage = document.getElementById("formMessage");
const deliveryCount = document.getElementById("deliveryCount");
const activityLog = document.getElementById("activityLog");

// Dashboard
const totalDeliveries = document.getElementById("totalDeliveries");
const openDeliveries = document.getElementById("openDeliveries");
const activeDeliveries = document.getElementById("activeDeliveries");
const deliveredDeliveries = document.getElementById("deliveredDeliveries");

// Dashboard clock
const greeting = document.getElementById("greeting");
const currentTime = document.getElementById("currentTime");
const currentDate = document.getElementById("currentDate");

let previousDeliveries = [];

// -----------------------------
// Load deliveries
// -----------------------------

async function loadDeliveries() {
  try {
    const response = await fetch("/api/deliveries");

    if (!response.ok) {
      throw new Error("Failed to load deliveries");
    }

    const deliveries = await response.json();

    const hasChanged =
      JSON.stringify(deliveries) !== JSON.stringify(previousDeliveries);

    if (hasChanged) {
      detectChanges(deliveries);

      previousDeliveries = deliveries;

      renderDispatcher(deliveries);
      renderRider(deliveries);
      updateDashboardStats(deliveries);
    }
  } catch (error) {
    console.error("Unable to load deliveries:", error);
  }
}

// -----------------------------
// Create delivery
// -----------------------------

deliveryForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const delivery = {
    orderId: document.getElementById("orderId").value.trim().toUpperCase(),

    customerName: document.getElementById("customerName").value.trim(),

    customerPhone: document.getElementById("customerPhone").value.trim(),

    address: document.getElementById("address").value.trim(),

    itemDescription: document.getElementById("itemDescription").value.trim(),
  };

  try {
    const response = await fetch("/api/deliveries", {
      method: "POST",

      headers: {
        "Content-Type": "application/json",
      },

      body: JSON.stringify(delivery),
    });

    const data = await response.json();

    if (!response.ok) {
      formMessage.textContent = data.error;
      formMessage.className = "error";
      return;
    }

    formMessage.textContent = `Delivery ${data.delivery.id} created successfully.`;

    formMessage.className = "success";

    deliveryForm.reset();

    // Immediately refresh the dispatcher
    await loadDeliveries();
  } catch (error) {
    console.error("Create delivery error:", error);

    formMessage.textContent = "Unable to connect to the server.";

    formMessage.className = "error";
  }
});

// -----------------------------
// Dispatcher
// -----------------------------

function renderDispatcher(deliveries) {
  deliveryList.innerHTML = "";

  deliveryCount.textContent = `${deliveries.length} deliveries`;

  if (deliveries.length === 0) {
    deliveryList.innerHTML = `
      <div class="empty">
        No delivery requests yet.
      </div>
    `;

    return;
  }

  deliveries.forEach((delivery) => {
    const card = document.createElement("div");

    card.className = "delivery-card";

    const rider = getRiderName(delivery.riderId);

    card.innerHTML = `
      <div class="delivery-header">

        <h3>
          ${escapeHtml(delivery.orderId)} —
          ${escapeHtml(delivery.customerName)}
        </h3>

        <span class="status ${delivery.status}">
          ${delivery.status.replace("_", " ")}
        </span>

      </div>

      <div class="delivery-info">

        <strong>Delivery:</strong>
        ${escapeHtml(delivery.id)}

        <br>

        <strong>Phone:</strong>
        ${escapeHtml(delivery.customerPhone)}

        <br>

        <strong>Address:</strong>
        ${escapeHtml(delivery.address)}

        <br>

        <strong>Item:</strong>
        ${escapeHtml(delivery.itemDescription)}

        <br>

        <strong>Rider:</strong>
        ${escapeHtml(rider)}

      </div>

      ${
        delivery.status === "OPEN"
          ? `
            <div class="assign-row">

              <select id="rider-${delivery.id}">

                <option value="">
                  Select rider
                </option>

                <option value="R001">
                  Kevin
                </option>

                <option value="R002">
                  Brian
                </option>

                <option value="R003">
                  David
                </option>

              </select>

              <button
                onclick="assignDelivery('${delivery.id}')"
              >
                Assign Rider
              </button>

            </div>
          `
          : ""
      }
    `;

    deliveryList.appendChild(card);
  });
}

// -----------------------------
// Assign delivery
// -----------------------------

async function assignDelivery(deliveryId) {
  const selector = document.getElementById(`rider-${deliveryId}`);

  if (!selector) {
    return;
  }

  const riderId = selector.value;

  if (!riderId) {
    alert("Please select a rider.");
    return;
  }

  try {
    const response = await fetch(`/api/deliveries/${deliveryId}/assign`, {
      method: "POST",

      headers: {
        "Content-Type": "application/json",
      },

      body: JSON.stringify({
        riderId,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      alert(data.error);
      return;
    }

    await loadDeliveries();
  } catch (error) {
    console.error("Assign delivery error:", error);

    alert("Unable to connect to the server.");
  }
}

// -----------------------------
// Rider
// -----------------------------

function renderRider(deliveries) {
  const selectedRider = riderSelector.value;

  const assigned = deliveries.filter(
    (delivery) => delivery.riderId === selectedRider,
  );

  riderDeliveries.innerHTML = "";

  if (assigned.length === 0) {
    riderDeliveries.innerHTML = `
      <div class="empty">
        No deliveries assigned.
      </div>
    `;

    return;
  }

  assigned.forEach((delivery) => {
    const card = document.createElement("div");

    card.className = "delivery-card";

    card.innerHTML = `
      <div class="delivery-header">

        <h3>
          ${escapeHtml(delivery.orderId)}
        </h3>

        <span class="status ${delivery.status}">
          ${delivery.status.replace("_", " ")}
        </span>

      </div>

      <div class="delivery-info">

        <strong>Customer:</strong>
        ${escapeHtml(delivery.customerName)}

        <br>

        <strong>Phone:</strong>
        ${escapeHtml(delivery.customerPhone)}

        <br>

        <strong>Address:</strong>
        ${escapeHtml(delivery.address)}

        <br>

        <strong>Item:</strong>
        ${escapeHtml(delivery.itemDescription)}

      </div>

      ${
        delivery.status === "ASSIGNED"
          ? `
            <div class="rider-actions">

              <button
                onclick="updateStatus(
                  '${delivery.id}',
                  'PICKED_UP'
                )"
              >
                Mark Picked Up
              </button>

            </div>
          `
          : ""
      }

      ${
        delivery.status === "PICKED_UP"
          ? `
            <div class="rider-actions">

              <button
                onclick="updateStatus(
                  '${delivery.id}',
                  'DELIVERED'
                )"
              >
                Mark Delivered
              </button>

            </div>
          `
          : ""
      }
    `;

    riderDeliveries.appendChild(card);
  });
}

// -----------------------------
// Update delivery status
// -----------------------------

async function updateStatus(deliveryId, status) {
  try {
    const response = await fetch(`/api/deliveries/${deliveryId}/status`, {
      method: "PATCH",

      headers: {
        "Content-Type": "application/json",
      },

      body: JSON.stringify({
        status,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      alert(data.error);
      return;
    }

    await loadDeliveries();
  } catch (error) {
    console.error("Update status error:", error);

    alert("Unable to connect to the server.");
  }
}

// -----------------------------
// Sync / change detection
// -----------------------------

function detectChanges(deliveries) {
  deliveries.forEach((delivery) => {
    const previous = previousDeliveries.find((item) => item.id === delivery.id);

    if (!previous) {
      addActivity(`${delivery.id} created — OPEN`);

      return;
    }

    if (previous.status !== delivery.status) {
      addActivity(`${delivery.id}: ${previous.status} → ${delivery.status}`);
    }
  });
}

// -----------------------------
// Activity log
// -----------------------------

function addActivity(text) {
  const time = new Date().toLocaleTimeString();

  const element = document.createElement("div");

  element.className = "activity";

  element.textContent = `${time} — ${text}`;

  if (activityLog.querySelector(".empty")) {
    activityLog.innerHTML = "";
  }

  activityLog.prepend(element);
}

// -----------------------------
// Delivery history
// -----------------------------

async function loadHistory(search = "") {
  try {
    const url = search
      ? `/api/history?search=${encodeURIComponent(search)}`
      : "/api/history";

    const response = await fetch(url);

    if (!response.ok) {
      throw new Error("Failed to load delivery history");
    }

    const deliveries = await response.json();

    renderHistory(deliveries);
  } catch (error) {
    console.error("Unable to load delivery history:", error);

    activityLog.innerHTML = `
      <div class="empty">
        Unable to load delivery history.
      </div>
    `;
  }
}

function renderHistory(deliveries) {
  activityLog.innerHTML = "";

  if (deliveries.length === 0) {
    activityLog.innerHTML = `
      <div class="empty">
        No matching deliveries found.
      </div>
    `;

    return;
  }

  deliveries.forEach((delivery) => {
    const card = document.createElement("div");

    card.className = "history-card";

    const rider = getRiderName(delivery.riderId);

    const createdDate = new Date(
      delivery.createdAt
    ).toLocaleString();

    const updatedDate = new Date(
      delivery.updatedAt
    ).toLocaleString();

    card.innerHTML = `
      <div class="history-card-header">

        <h3>
          ${escapeHtml(delivery.orderId)}
        </h3>

        <span class="status ${delivery.status}">
          ${delivery.status}
        </span>

      </div>

      <div class="history-card-info">

        <strong>Delivery ID:</strong>
        ${escapeHtml(delivery.id)}

        <br>

        <strong>Customer:</strong>
        ${escapeHtml(delivery.customerName)}

        <br>

        <strong>Phone:</strong>
        ${escapeHtml(delivery.customerPhone)}

        <br>

        <strong>Address:</strong>
        ${escapeHtml(delivery.address)}

        <br>

        <strong>Item:</strong>
        ${escapeHtml(delivery.itemDescription)}

        <br>

        <strong>Rider:</strong>
        ${escapeHtml(rider)}

        <br>

        <strong>Created:</strong>
        ${escapeHtml(createdDate)}

        <br>

        <strong>Last Updated:</strong>
        ${escapeHtml(updatedDate)}

      </div>
    `;

    activityLog.appendChild(card);
  });
}

// -----------------------------
// Utilities
// -----------------------------

function getRiderName(riderId) {
  const riders = {
    R001: "Kevin",
    R002: "Brian",
    R003: "David",
  };

  return riderId ? riders[riderId] || riderId : "Unassigned";
}

function escapeHtml(value) {
  const div = document.createElement("div");

  div.textContent = value;

  return div.innerHTML;
}

// -----------------------------
// Rider selector
// -----------------------------

riderSelector.addEventListener("change", () => {
  renderRider(previousDeliveries);
});

// -----------------------------
// Delivery history search
// -----------------------------

const historySearch = document.getElementById("historySearch");
const historySearchButton = document.getElementById(
  "historySearchButton"
);

historySearchButton.addEventListener("click", () => {
  loadHistory(historySearch.value.trim());
});

historySearch.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    loadHistory(historySearch.value.trim());
  }
});

// -----------------------------
// Dashboard statistics
// -----------------------------

function updateDashboardStats(deliveries) {
  const total = deliveries.length;

  const open = deliveries.filter(
    (delivery) => delivery.status === "OPEN",
  ).length;

  const active = deliveries.filter(
    (delivery) =>
      delivery.status === "ASSIGNED" || delivery.status === "PICKED_UP",
  ).length;

  const delivered = deliveries.filter(
    (delivery) => delivery.status === "DELIVERED",
  ).length;

  if (totalDeliveries) {
    totalDeliveries.textContent = total;
  }

  if (openDeliveries) {
    openDeliveries.textContent = open;
  }

  if (activeDeliveries) {
    activeDeliveries.textContent = active;
  }

  if (deliveredDeliveries) {
    deliveredDeliveries.textContent = delivered;
  }
}

// -----------------------------
// Dashboard greeting + clock
// -----------------------------

function updateDashboardTime() {
  const now = new Date();

  const hour = now.getHours();

  let greetingText;

  if (hour >= 5 && hour < 12) {
    greetingText = "Good morning";
  } else if (hour >= 12 && hour < 18) {
    greetingText = "Good afternoon";
  } else if (hour >= 18 && hour < 22) {
    greetingText = "Good evening";
  } else {
    greetingText = "Good night";
  }

  if (greeting) {
    greeting.textContent = greetingText;
  }

  if (currentTime) {
    currentTime.textContent = now.toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
    });
  }

  if (currentDate) {
    currentDate.textContent = now.toLocaleDateString([], {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  }
}

// -----------------------------
// Clear demo data
// -----------------------------

const clearDemoDataButton = document.getElementById(
  "clearDemoDataButton",
);

if (clearDemoDataButton) {
  clearDemoDataButton.addEventListener("click", async () => {
    const confirmed = confirm(
      "Are you sure you want to clear all demo deliveries and delivery history?",
    );

    if (!confirmed) {
      return;
    }

    try {
      const response = await fetch("/api/admin/clear-demo-data", {
        method: "DELETE",
      });

      const data = await response.json();

      if (!response.ok) {
        alert(data.error || "Unable to clear demo data.");
        return;
      }

      alert("Demo data cleared successfully.");

      previousDeliveries = [];

      await loadDeliveries();
      await loadHistory();
    } catch (error) {
      console.error("Clear demo data error:", error);

      alert("Unable to connect to the server.");
    }
  });
}

// -----------------------------
// Initial load
// -----------------------------

loadDeliveries();
loadHistory();

updateDashboardTime();

setInterval(loadDeliveries, 5000);

setInterval(updateDashboardTime, 30000);
