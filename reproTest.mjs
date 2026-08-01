import axios from "axios";

const LOCAL = "http://localhost:5000/api";
const REMOTE = "https://backend.serlextechnologies.com/api";

async function main() {
  const login = await axios.post(`${LOCAL}/auth/login`, {
    employeeId: "PUTEST",
    password: "0201",
  });
  const token = login.data.token;
  console.log("LOGIN OK, user:", login.data.user.name);

  const headers = { Authorization: `Bearer ${token}` };

  const list = await axios.get(`${LOCAL}/purchase-orders/daily-activity`, { headers });
  const rows = list.data.rows || [];
  console.log("daily-activity rows:", rows.length);
  const row = rows[0];
  console.log("row:", row.poNo, "activityStatus:", JSON.stringify(row.activityStatus));

  // Reproduce "Ordered" failure with full error
  try {
    const res = await axios.patch(
      `${LOCAL}/purchase-orders/daily-activity/${row._id}`,
      { activityStatus: "Ordered", remarks: "repro ordered test" },
      { headers }
    );
    console.log("LOCAL PATCH Ordered ->", res.data.message);
  } catch (e) {
    console.log("LOCAL PATCH Ordered FAIL ->", e.response?.status, JSON.stringify(e.response?.data));
  }

  // Now test REMOTE backend with same token
  try {
    const rList = await axios.get(`${REMOTE}/purchase-orders/daily-activity`, { headers });
    const rRows = rList.data.rows || [];
    console.log("REMOTE daily-activity rows:", rRows.length);
    const rRow = rRows[0];
    console.log("REMOTE row:", rRow.poNo, "activityStatus:", JSON.stringify(rRow.activityStatus));
    if (rRow) {
      const statuses = [
        "Not Ordered",
        "Ordered",
        "Material Dispatched by Supplier",
        "Material Received",
        "Material Dispatch",
        "Material In Transit",
        "Material Received at Customer End",
        "Delivered",
        "Payment Received",
      ];
      for (const s of statuses) {
        try {
          const res = await axios.patch(
            `${REMOTE}/purchase-orders/daily-activity/${rRow._id}`,
            { activityStatus: s, remarks: `remote repro -> ${s}` },
            { headers }
          );
          console.log(`REMOTE PATCH ${JSON.stringify(s)} -> ${res.data.message}`);
        } catch (e) {
          console.log(
            `REMOTE PATCH ${JSON.stringify(s)} -> FAIL: ${e.response?.status} ${e.response?.data?.message || e.message}`
          );
        }
      }
    }
  } catch (e) {
    console.log("REMOTE test failed:", e.response?.status, e.response?.data?.message || e.message);
  }
}

main().catch((e) => {
  console.log("FATAL:", e.response?.status, e.response?.data || e.message);
  process.exit(1);
});
