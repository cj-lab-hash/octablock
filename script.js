// Global Data
let headers = [];
let Data = [];
const keepHeaders = [
  "Order ID", "Order Status", "Order Substatus", "Variation", "Quantity",
  "SKU Subtotal Before Discount", "SKU Platform Discount",
  "SKU Subtotal After Discount", "Shipping Fee After Discount",
  "Payment platform discount", "Order Amount"
];
let expenses = JSON.parse(localStorage.getItem("expenses")) || [];

// Helpers
function parseNumber(value) {
  const n = parseFloat(value);
  return isNaN(n) ? 0 : n;
}

function formatNumber(value) {
  return Number(value.toFixed(2));
}

function formatPeso(value) {
  return '\u20B1' + Number(value).toLocaleString('en-PH', {
    minimumFractionDigits: 2, maximumFractionDigits: 2
  });
}

// File Handling
document.getElementById('fileInput').addEventListener('change', function () {
  if (this.files.length) processFile();
});

function processFile() {
  const fileInput = document.getElementById('fileInput');
  if (!fileInput.files.length) return alert('Select a CSV file first.');
  const fileName = fileInput.files[0].name;
  const processedDate = new Date().toLocaleString();
  document.getElementById('reportInfo').innerHTML =
    `<strong>File:</strong> ${fileName} &nbsp; | &nbsp; <strong>Processed:</strong> ${processedDate}`;

  Papa.parse(fileInput.files[0], {
    header: true,
    skipEmptyLines: true,
    complete: function (results) {
      Data = results.data;
      headers = Object.keys(Data[0]);
      runWorkflow();
      displaySummary();
    }
  });
}

// Workflow: Clean & Compute Settlement
function runWorkflow() {
  Data = Data.filter(row => {
    const status = (row["Order Status"] || "").toLowerCase().trim();
    return !(status === "cancel" || status === "canceled" || status === "cancele");
  });

  Data = Data.map(row => {
    const newRow = {};
    keepHeaders.forEach(h => { if (h in row) newRow[h] = row[h]; });
    return newRow;
  });

  headers = keepHeaders.slice();
  if (!headers.includes("Settlement Amount")) {
    headers.push("Settlement Amount");
    Data.forEach(row => { row["Settlement Amount"] = 0; });
  }

  Data.forEach(row => {
    const orderAmt = parseNumber(row["Order Amount"]);
    let shipping = 0, tiktokCommissions = 0, totalDeductions = 0;addeddeductions = 0

    if (orderAmt !== 0) {
      shipping = orderAmt * 0.0224;
      addeddeductions = orderAmt * 0.055;
      const orderIdx = headers.indexOf("Order Amount");
      const offsetHeader = headers[orderIdx - 3];
      const offsetVal = parseNumber(row[offsetHeader]);
      tiktokCommissions = offsetVal * 0.073;
      totalDeductions = shipping + tiktokCommissions + addeddeductions;
      row["Settlement Amount"] = formatNumber(offsetVal - totalDeductions);
    } else {
      row["Settlement Amount"] = 0;
    }
  });
}

// Summaries
function summarizeData() {
  let total = 0, otransit = 0, ocomplete = 0, odelivered = 0, titimes = 0;
  let settled = 0, notSettled = 0;

  Data.forEach(row => {
    const settlementAmt = parseNumber(row["Settlement Amount"]);
    total += settlementAmt;
    titimes += parseNumber(row["Quantity"]);

    const status = (row["Order Substatus"] || "").toLowerCase().trim();
    if (status === "in transit") otransit++;
    if (status === "completed") ocomplete++;
    if (status === "delivered") odelivered++;

    if (status === "completed") settled += settlementAmt;
    else notSettled += settlementAmt;
  });

  return { total, otransit, ocomplete, odelivered, titimes, settled, notSettled };
}

function countVariations() {
  const counts = {};
  Data.forEach(row => {
    const varValue = (row["Variation"] || "").trim();
    if (varValue) {
      if (!counts[varValue]) counts[varValue] = 0;
      counts[varValue]++;
    }
  });
  return counts;
}

// Display Summary
function displaySummary() {
  const summary = summarizeData();
  const variationCounts = countVariations();
  document.getElementById("dataTable").style.display = "none";

  const container = document.getElementById("summaryContainer");
  container.innerHTML = `
    <div class="summary-grid">
      <div class="left-column">
        <div class="card card-settlement">
          <div class="card-header">Settlement Summary</div>
          <div class="card-body">
            <table>
              <tr><th>Total</th><th>Settled</th><th>To Settle</th></tr>
              <tr>
                <td>${formatPeso(summary.total)}</td>
                <td>${formatPeso(summary.settled)}</td>
                <td>${formatPeso(summary.notSettled)}</td>
              </tr>
            </table>
          </div>
        </div>

        <div class="card card-orders">
          <div class="card-header">Orders Summary</div>
          <div class="card-body">
            <table>
              <tr><th>In Transit</th><th>Completed</th><th>Delivered</th><th>Total Qty</th></tr>
              <tr>
                <td>${summary.otransit}</td>
                <td>${summary.ocomplete}</td>
                <td>${summary.odelivered}</td>
                <td>${summary.titimes}</td>
              </tr>
            </table>
          </div>
        </div>

        <div class="card card-variations">
          <div class="card-header">Variation Counts</div>
          <div class="card-body">
            <table>
              <tr>${Object.keys(variationCounts).map(v => `<th>${v}</th>`).join('')}</tr>
              <tr>${Object.values(variationCounts).map(c => `<td>${c}</td>`).join('')}</tr>
            </table>
          </div>
        </div>

        <div class="card card-net">
          <div class="card-header">Net Settlement Breakdown</div>
          <div class="card-body">
            ${renderNetSettlement(summary.settled)}
          </div>
        </div>
      </div>

      <div class="right-column">
        <div class="card card-expenses">
          <div class="card-header">Expenses</div>
          <div class="card-body">
            <div>
              <input type="text" id="expenseName" placeholder="Expense Name">
              <input type="number" id="expenseAmount" placeholder="Amount">
              <button class="btn" onclick="addExpense()">Add</button>
            </div>
            <div id="expensesList"></div>
            <div class="expenses-total" id="expensesTotal"></div>
          </div>
        </div>
      </div>
    </div>
  `;

  renderExpenses();
}

// Net Settlement
function renderNetSettlement(settledAmount) {
  const expensesTotal = expenses.reduce((sum, e) => sum + e.amount, 0);
  const net = settledAmount - expensesTotal;
  const cls = net < 0 ? "negative" : "positive";
  const absNet = Math.abs(net);

  return `
    <div class="breakdown">
      <div class="breakdown-row">
        <span class="label">Settled Amount</span>
        <span class="value">${formatPeso(settledAmount)}</span>
      </div>
      <div class="breakdown-row">
        <span class="label">Total Expenses</span>
        <span class="value">${formatPeso(expensesTotal)}</span>
      </div>
    </div>
    <div class="net-amount ${cls}">${formatPeso(absNet)}</div>
  `;
}


// Expenses Functions
function renderExpenses() {
  const listDiv = document.getElementById("expensesList");
  const totalDiv = document.getElementById("expensesTotal");
  listDiv.innerHTML = "";
  let total = 0;

  expenses.forEach((exp, i) => {
    total += exp.amount;
    listDiv.innerHTML += `
      <div class="expense-item">
        <span>${exp.name}</span>
        <span>${formatPeso(exp.amount)} <button onclick="removeExpense(${i})">✖</button></span>
      </div>`;
  });

  totalDiv.textContent = "Total Expenses: " + formatPeso(total);
  updateNetSettlement();
}

function addExpense() {
  const name = document.getElementById("expenseName").value.trim();
  const amount = parseNumber(document.getElementById("expenseAmount").value);
  if (!name || amount <= 0) return alert("Enter valid name and amount");

  expenses.push({ name, amount });
  localStorage.setItem("expenses", JSON.stringify(expenses));
  renderExpenses();

  document.getElementById("expenseName").value = "";
  document.getElementById("expenseAmount").value = "";
}

function removeExpense(i) {
  expenses.splice(i, 1);
  localStorage.setItem("expenses", JSON.stringify(expenses));
  renderExpenses();
}

function updateNetSettlement() {
  const { settled } = summarizeData();
  const netDiv = document.querySelector(".card-net .card-body");
  if (netDiv) {
    netDiv.innerHTML = renderNetSettlement(settled);
  }
}

