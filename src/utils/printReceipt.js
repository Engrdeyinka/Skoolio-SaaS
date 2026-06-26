import { formatDateInLagos, formatTimeInLagos } from "@/lib/timezone";
import { BRAND } from "@/config/brand";

export function printReceipt({
  schoolName = BRAND.schoolName.toUpperCase(),
  receiptNo = "",
  student,
  amountPaid = 0,
  totalFees = 0,
  previouslyPaid = 0,
  feeBreakdown = [],
  term = "",
  academicYear = "",
  paymentMethod = "Cash",
  paymentDate = "",
  notes = "",
  cashier = "Admin",
}) {
  const balance   = Math.max(0, totalFees - previouslyPaid - amountPaid);
  const totalPaid = previouslyPaid + amountPaid;

  const fmt = (n) =>
    "N" + Number(n || 0).toLocaleString("en-NG", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

  const parsedDate = paymentDate
    ? new Date(paymentDate.includes("T") ? paymentDate : paymentDate + "T12:00:00")
    : new Date();
  const dateStr    = formatDateInLagos(parsedDate, { day: "2-digit", month: "short", year: "numeric" });
  const timeStr    = formatTimeInLagos(new Date(), { hour: "2-digit", minute: "2-digit" });
  const dueDate    = new Date(parsedDate);
  dueDate.setDate(dueDate.getDate() + 7);
  const dueDateStr = formatDateInLagos(dueDate, { day: "numeric", month: "short", year: "numeric" });

  const methodLabels = {
    cash: "Cash", check: "Cheque", credit_card: "Card",
    bank_transfer: "Bank Transfer", online: "Online",
  };

  const breakdownRows = feeBreakdown.length > 0
    ? feeBreakdown
    : [{ name: "Termly Tuition", amount: totalFees }];

  const studentName = ((student?.first_name || "") + " " + (student?.last_name || "")).trim();

  // The POS browser renders at its full viewport width then scales down to
  // 58mm paper. At a typical 360px viewport → 219px paper the scale is ~0.6.
  // So a 26px source font prints as ~16px — clear and readable.
  // AMT PAID at 44px prints as ~26px — bold and prominent.
  const LBL = "font-size:26px;font-weight:bold;padding:4px 0;vertical-align:top;width:52%;word-break:break-word;font-family:Arial,Helvetica,sans-serif;";
  const VAL = "font-size:26px;font-weight:bold;padding:4px 0;text-align:right;vertical-align:top;width:48%;word-break:break-word;font-family:Arial,Helvetica,sans-serif;";
  const DIV   = `<div style="border-top:2px dashed #000;margin:10px 0;"></div>`;
  const SOLID = `<div style="border-top:4px solid #000;margin:8px 0;"></div>`;

  const receiptHtml = `
<div style="font-family:Arial,Helvetica,sans-serif;color:#000;width:100%;line-height:1.5;">

  <div style="text-align:center;margin-bottom:10px;">
    <div style="font-size:30px;font-weight:bold;text-transform:uppercase;line-height:1.3;">${schoolName}</div>
    <div style="font-size:28px;font-weight:bold;margin-top:4px;">PAYMENT RECEIPT</div>
    ${receiptNo ? `<div style="font-size:24px;font-weight:bold;">No: ${receiptNo}</div>` : ""}
  </div>

  ${DIV}

  <table style="width:100%;border-collapse:collapse;">
    <tr><td style="${LBL}">Date</td><td style="${VAL}">${dateStr}</td></tr>
    <tr><td style="${LBL}">Time</td><td style="${VAL}">${timeStr}</td></tr>
    <tr><td style="${LBL}">Student</td><td style="${VAL}">${studentName}</td></tr>
    <tr><td style="${LBL}">Class</td><td style="${VAL}">${student?.grade || ""}</td></tr>
    <tr><td style="${LBL}">Term</td><td style="${VAL}">${term}</td></tr>
    <tr><td style="${LBL}">Year</td><td style="${VAL}">${academicYear}</td></tr>
  </table>

  ${DIV}

  <div style="font-size:24px;font-weight:bold;text-transform:uppercase;margin-bottom:6px;">Fee Breakdown</div>
  <table style="width:100%;border-collapse:collapse;">
    ${breakdownRows.map(f =>
      `<tr><td style="${LBL}">${f.name}</td><td style="${VAL}">${fmt(f.amount)}</td></tr>`
    ).join("")}
  </table>
  ${SOLID}
  <table style="width:100%;border-collapse:collapse;">
    <tr><td style="${LBL}">Total Fees</td><td style="${VAL}">${fmt(totalFees)}</td></tr>
  </table>

  ${DIV}

  <table style="width:100%;border-collapse:collapse;">
    ${previouslyPaid > 0 ? `<tr><td style="${LBL}">Prev. Paid</td><td style="${VAL}">${fmt(previouslyPaid)}</td></tr>` : ""}
    <tr>
      <td style="font-size:44px;font-weight:bold;padding:6px 0;font-family:Arial,Helvetica,sans-serif;">AMT PAID</td>
      <td style="font-size:44px;font-weight:bold;padding:6px 0;text-align:right;font-family:Arial,Helvetica,sans-serif;">${fmt(amountPaid)}</td>
    </tr>
    ${previouslyPaid > 0 ? `<tr><td style="${LBL}">Total Paid</td><td style="${VAL}">${fmt(totalPaid)}</td></tr>` : ""}
  </table>
  ${SOLID}
  <table style="width:100%;border-collapse:collapse;">
    <tr>
      <td style="font-size:30px;font-weight:bold;padding:4px 0;font-family:Arial,Helvetica,sans-serif;">Balance</td>
      <td style="font-size:30px;font-weight:bold;padding:4px 0;text-align:right;font-family:Arial,Helvetica,sans-serif;">${balance <= 0 ? "PAID" : fmt(balance)}</td>
    </tr>
    <tr><td style="${LBL}">Method</td><td style="${VAL}">${methodLabels[paymentMethod] || paymentMethod}</td></tr>
    <tr><td style="${LBL}">Cashier</td><td style="${VAL}">${cashier}</td></tr>
  </table>
  ${notes ? `<div style="font-size:24px;font-weight:bold;margin-top:6px;word-break:break-word;">Note: ${notes}</div>` : ""}

  ${DIV}

  ${balance <= 0
    ? `<div style="text-align:center;font-size:32px;font-weight:bold;margin:8px 0;">*** PAID IN FULL ***</div>`
    : `<div style="text-align:center;font-size:30px;font-weight:bold;margin:6px 0;">PARTIAL PAYMENT</div>
       <div style="text-align:center;font-size:24px;font-weight:bold;margin:4px 0;">Pay balance by ${dueDateStr}</div>`
  }
  <div style="text-align:center;font-size:28px;font-weight:bold;margin-top:8px;">Thank you!</div>

  ${DIV}
  <div style="text-align:center;font-size:22px;font-weight:bold;">${new Date().getFullYear()} &copy; ${schoolName}</div>

</div>`;

  // ── 1. Snapshot + hide body children FIRST, before anything else ─────────
  // Must happen before any style injection — injecting width CSS causes a
  // reflow that makes React remount Radix portals outside #root, which then
  // escape the snapshot and bleed into the print.
  const bodyChildren = Array.from(document.body.children);
  const savedDisplays = bodyChildren.map((el) => el.style.display);
  bodyChildren.forEach((el) => {
    el.style.setProperty("display", "none", "important");
  });

  // ── 2. Inject @page style — NO width changes, no reflow ─────────────────
  const style = document.createElement("style");
  style.id = "__rp_style__";
  style.textContent = `
    @page { size: 58mm auto; margin: 2mm; }
    html, body {
      background: #fff !important;
      margin: 0 !important;
      padding: 0 !important;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
  `;
  document.head.appendChild(style);

  // ── 3. Inject receipt ────────────────────────────────────────────────────
  const receipt = document.createElement("div");
  receipt.id = "__rp_root__";
  receipt.innerHTML = receiptHtml;
  document.body.appendChild(receipt);

  // ── 4. Restore on afterprint ─────────────────────────────────────────────
  const cleanup = () => {
    bodyChildren.forEach((el, i) => {
      el.style.display = savedDisplays[i];
    });
    document.getElementById("__rp_style__")?.remove();
    document.getElementById("__rp_root__")?.remove();
  };
  window.addEventListener("afterprint", cleanup, { once: true });
  const fallback = setTimeout(cleanup, 30000);
  window.addEventListener("afterprint", () => clearTimeout(fallback), { once: true });

  // ── 5. Wait for the browser to paint our changes before printing ─────────
  // Without this, some Android WebViews capture the pre-change frame.
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      window.print();
    });
  });
}
