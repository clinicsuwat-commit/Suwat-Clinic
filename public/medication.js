export function shiftDay(isoDay, offset) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDay || "")) return "";
  const date = new Date(isoDay + "T00:00:00Z");
  if (!Number.isFinite(date.getTime())) return "";
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

export function estimateDepletion(item) {
  if (item.schedule !== "regular") return "";
  const half = Number(item.dose) * 2;
  const qty = Number(item.quantity);
  const times = Number(item.times_daily);
  if (
    !Number.isInteger(half) ||
    half < 1 ||
    half > 40 ||
    !Number.isInteger(times) ||
    times < 1 ||
    times > 8 ||
    !Number.isInteger(qty) ||
    qty < 1 ||
    qty > 10000 ||
    qty * 2 < half
  )
    return "";
  return shiftDay(item.started_on, Math.ceil((qty * 2) / (half * times)) - 1);
}

export function createMedicationUI({
  loc,
  esc,
  ico,
  today,
  displayDate,
  field,
  btn,
  msg,
  nextButton,
  branchSelect,
  branchName,
}) {
  function options(drugs, stockedOnly = false, active = "") {
    return (
      `<option value="">${loc("เลือกยา", "Choose medication")}</option>` +
      drugs
        .filter((drug) => !stockedOnly || drug.stock > 0)
        .map(
          (drug) =>
            `<option value="${drug.id}" data-stock="${drug.stock}" ${String(drug.id) === String(active) ? "selected" : ""}>${esc([drug.name, drug.strength].filter(Boolean).join(" "))} · ${drug.stock} ${loc("เม็ด", "tablets")}</option>`,
        )
        .join("")
    );
  }

  function inventory(branch, drugs) {
    const list = drugs
      ?.map(
        (
          drug,
        ) => `<div class="identity-row"><span class="tile-icon">${ico("pill")}</span><div>
      <strong>${esc(drug.name)} ${esc(drug.strength)}</strong>
      <small>${drug.next_expiry ? loc("ล็อตใกล้หมดอายุ ", "Next expiry ") + displayDate(drug.next_expiry) : loc("ยังไม่มีล็อตที่พร้อมใช้", "No usable stock")}</small>
      </div><span class="tag ${drug.stock ? "" : "warn"}">${drug.stock} ${loc("เม็ด", "tablets")}</span></div>`,
      )
      .join("");
    return `<div class="clinic-stock"><section class="card"><div class="care-heading"><div><h3>${loc("สต็อกยาคลินิก", "Clinical medication stock")}</h3><p>${loc("เลือกสาขาเพื่อดูยอดตามล็อตที่ยังไม่หมดอายุ", "Choose a branch to see quantities from unexpired lots.")}</p></div>
      ${branchSelect("stock_branch", branch, "stock-branch")}</div>${list || `<p class="muted">${branch ? loc("ยังไม่มีรายการยา", "No medications yet.") : loc("เลือกสาขาก่อน", "Choose a branch first.")}</p>`}</section>
      <div class="config-grid"><section class="card"><h3>${loc("เพิ่มรายการยา", "Add medication")}</h3>
        <form class="care-form" data-care-form="stock-create">
          ${field("name", loc("ชื่อยาตามฉลาก", "Medication name on label"), 'required maxlength="120"')}
          ${field("strength", loc("ความแรงหรือรูปแบบตามฉลาก", "Strength or form on label"), 'maxlength="60"')}
          ${nextButton(loc("เพิ่มรายการยา", "Add medication"), "plus")}
        </form></section><section class="card"><h3>${loc("รับยาเข้าสต็อก", "Receive stock")}</h3>
        <form class="care-form" data-care-form="stock-intake">
          ${branchSelect("branch_id", branch, "stock-intake-branch", true)}
          <label class="care-field"><span>${loc("รายการยา", "Medication")}</span><select class="select" name="drug_id" required>${options(drugs || [])}</select></label>
          <div class="care-fields">${field("lot_no", loc("เลขล็อต", "Lot number"), 'required maxlength="60"')}
          ${field("quantity", loc("จำนวนเม็ดที่รับ", "Tablets received"), 'required min="1" max="100000"', "number")}</div>
          ${field("expires_on", loc("วันหมดอายุของล็อต", "Lot expiry date"), `required min="${today()}"`, "date")}
          ${nextButton(loc("บันทึกรับยา", "Save stock intake"), "check")}
        </form></section></div></div>`;
  }

  function drugRow(drugs) {
    return `<fieldset class="drug-input-row" data-drug-row><legend>${loc("รายการยาตามใบสั่ง", "Medication on prescription")}</legend>
      <div class="care-fields">
        <label class="care-field"><span>${loc("เลือกยาจากสต็อกสาขา", "Select medication from branch stock")}</span><select class="select" name="drug_id" required>${options(drugs, true)}</select></label>
        ${field("quantity", loc("จำนวนเม็ดที่จ่าย", "Tablets dispensed"), 'required min="1" max="10000" inputmode="numeric"', "number")}
      </div>
      <div class="dose-presets"><span>${loc("พรีเซ็ตวิธีใช้ตามใบสั่ง", "Prescription entry presets")}</span><div class="care-actions">
        ${[1, 2, 3].map((times) => btn("dose-preset", loc("1 เม็ดหลังอาหาร " + times + " เวลา", "1 tablet after meals · " + times + "×/day"), "", "soft", times)).join("")}
      </div></div>
      <div class="care-fields">
        <label class="care-field"><span>${loc("รูปแบบการใช้", "Schedule type")}</span><select class="select" name="schedule" required>
          <option value="">${loc("เลือกตามใบสั่ง", "Choose from the prescription")}</option>
          <option value="regular">${loc("จำนวนคงที่ทุกวัน", "Fixed daily schedule")}</option>
          <option value="variable">${loc("ใช้เมื่อจำเป็น / ปรับขนาดยา", "As needed / variable dose")}</option>
        </select></label>
        ${field("extra_directions", loc("หมายเหตุตามใบสั่ง (สตาฟเท่านั้น)", "Prescription notes (staff only)"), 'maxlength="300"')}
      </div>
      <div class="care-fields dose-grid" data-regular hidden>
        ${field("dose", loc("จำนวนเม็ดต่อครั้ง", "Tablets per dose"), 'min="0.5" max="20" step="0.5" disabled', "number")}
        ${field("times_daily", loc("จำนวนครั้งต่อวัน", "Doses per day"), 'min="1" max="8" disabled', "number")}
        <label class="care-field"><span>${loc("ช่วงเทียบกับอาหาร", "Meal timing")}</span><select class="select" name="meal_timing" disabled>
          <option value="unspecified">${loc("ตามใบสั่ง / ไม่ระบุ", "As on prescription / unspecified")}</option>
          <option value="after_food">${loc("หลังอาหาร", "After meals")}</option><option value="before_food">${loc("ก่อนอาหาร", "Before meals")}</option>
        </select></label>
        ${field("started_on", loc("วันที่เริ่มใช้", "Start date"), `min="${today()}" value="${today()}" disabled`, "date")}
      </div>
      <p class="dose-estimate" data-item-estimate aria-live="polite"></p>
      ${btn("remove-drug", loc("ลบรายการ", "Remove item"))}
    </fieldset>`;
  }

  function getItems(form) {
    return [...form.querySelectorAll("[data-drug-row]")].map((row) => {
      const value = (name) => row.querySelector('[name="' + name + '"]').value;
      return {
        drug_id: value("drug_id"),
        quantity: value("quantity"),
        schedule: value("schedule"),
        dose: value("dose"),
        times_daily: value("times_daily"),
        meal_timing: value("meal_timing"),
        started_on: value("started_on"),
        directions: value("extra_directions"),
      };
    });
  }

  function update(form) {
    const items = getItems(form);
    const dates = [];
    form.querySelectorAll("[data-drug-row]").forEach((row, index) => {
      const item = items[index];
      const regular = item.schedule === "regular";
      const group = row.querySelector("[data-regular]");
      group.hidden = !regular;
      group.querySelectorAll("input,select").forEach((field) => {
        field.disabled = !regular;
        field.required = regular && field.name !== "meal_timing";
      });
      for (const preset of row.querySelectorAll('[data-care="dose-preset"]')) {
        const selected =
          regular &&
          Number(item.dose) === 1 &&
          item.meal_timing === "after_food" &&
          item.times_daily === preset.dataset.value;
        preset.setAttribute("aria-pressed", String(selected));
      }
      const currentStock =
        row.querySelector("[name=drug_id]").selectedOptions[0]?.dataset.stock;
      row.querySelector("[name=quantity]").max = currentStock
        ? String(Math.min(Number(currentStock), 10000))
        : "10000";
      const date = estimateDepletion(item);
      if (date && item.drug_id) dates.push(date);
      row.querySelector("[data-item-estimate]").textContent =
        date && item.drug_id
          ? loc("คาดว่าใกล้หมด ", "Estimated low-supply date ") +
            displayDate(date)
          : item.schedule === "variable"
            ? loc(
                "วิธีใช้แบบปรับได้ คำนวณวันใกล้หมดจากจำนวนเม็ดไม่ได้",
                "Variable schedule. No estimated depletion date.",
              )
            : "";
    });
    const earliest = dates.sort()[0];
    const reminders = form.elements.remind.checked;
    const allow = form.elements.refill_allowed.checked;
    const autofrom = earliest
      ? [today(), shiftDay(earliest, -2)].sort().at(-1)
      : "";
    const opening = form.elements.refill_from;
    const ending = form.elements.refill_until;
    form.querySelector("[data-refill-window]").hidden = !allow;
    opening.disabled = ending.disabled = !allow;
    opening.required = allow && !autofrom;
    ending.required = allow;
    ending.min = opening.value || autofrom || today();
    form.querySelector("[data-dose-summary]").textContent = earliest
      ? (reminders
          ? loc("ระบบจะตั้งเตือนผ่าน LINE ตั้งแต่ ", "LINE reminder starts ") +
            displayDate(autofrom) +
            " · "
          : "") +
        loc("วันที่คาดว่าใกล้หมดเร็วที่สุด ", "Earliest estimated low-supply date ") +
        displayDate(earliest)
      : loc(
          "กรอกจำนวนและวิธีใช้แบบคงที่เพื่อดูวันที่คาดว่าใกล้หมด",
          "Enter a fixed schedule and tablet quantity to see the estimate.",
        );
    form.querySelector("[data-refill-opening]").textContent =
      allow && autofrom
        ? loc("ถ้าเว้นว่าง ระบบเปิดรับคำขอตั้งแต่ ", "If blank, requests open on ") +
          displayDate(autofrom)
        : "";
  }

  function fillPreset(button) {
    const row = button.closest("[data-drug-row]");
    row.querySelector("[name=schedule]").value = "regular";
    row.querySelector("[name=dose]").value = "1";
    row.querySelector("[name=times_daily]").value = button.dataset.value;
    row.querySelector("[name=meal_timing]").value = "after_food";
    update(row.closest("form"));
  }

  function changeBranch(form, drugs) {
    form.querySelectorAll("[name=drug_id]").forEach((s) => {
      const selected = s.value;
      s.innerHTML = options(drugs, true, selected);
    });
    update(form);
  }

  function dispenseMarkup(ctx, branch, drugs, key) {
    const branchField = ctx.visit.branch_id
      ? `<input type="hidden" name="branch_id" value="${esc(branch)}"><p class="muted">${esc(branchName(branch))}</p>`
      : branchSelect("branch_id", branch, "dispense-branch", true);
    return `<form class="care-form" data-care-form="dispense" data-key="${key}">
      <div class="scan-identity"><span class="tile-icon">${ico("pill")}</span><div><strong>${esc(ctx.patient.full_name)}</strong><p>HN ${esc(ctx.patient.hn)} · ${esc(ctx.visit.booking_ref)}</p></div></div>
      ${branchField}
      ${field("reference", loc("เลขอ้างอิงใบสั่งยา", "Prescription reference"), 'required maxlength="100"')}
      <div data-items>${drugRow(drugs)}</div>${btn("add-drug", loc("เพิ่มรายการยา", "Add medication"), "plus", "soft")}
      <p class="dose-summary" data-dose-summary role="status"></p>
      <label class="care-check"><input type="checkbox" name="remind" checked><span>${loc("แจ้งเตือนยาชุดนี้ผ่าน LINE ล่วงหน้า 2 วัน", "Send a LINE reminder two days before estimated depletion.")}</span></label>
      <label class="care-check"><input type="checkbox" name="refill_allowed"><span>${loc("อนุญาตให้ส่งคำขอชุดเดิมเพื่อให้คลินิกทบทวน", "Allow same-set requests for clinical review.")}</span></label>
      <div class="care-fields" data-refill-window hidden>
        ${field("refill_from", loc("วันเริ่มรับคำขอ", "Requests open on"), `min="${today()}" disabled`, "date")}
        ${field("refill_until", loc("วันสุดท้ายที่รับคำขอ", "Last day to request"), `min="${today()}" disabled`, "date")}
        <small data-refill-opening></small>
      </div>
      <label class="care-check"><input type="checkbox" name="verified" required><span>${loc("ตรวจชื่อคนไข้ รายการยา และวิธีใช้ตรงกับใบสั่งแล้ว", "I checked the patient, medications and directions against the prescription.")}</span></label>
      <details><summary>${loc("เปลี่ยนรหัส QR หากรหัสเดิมหมดอายุ", "Replace an expired QR code")}</summary>
      ${field("refresh_code", loc("รหัสใหม่จากคนไข้คนเดิม", "New code from the same patient"), 'maxlength="40" autocomplete="off" autocapitalize="characters"')}</details>
      ${nextButton(loc("บันทึกและตัดสต็อก", "Save and deduct stock"), "check")}
    </form>`;
  }

  return {
    inventory,
    dispenseMarkup,
    getItems,
    drugRow,
    update,
    changeBranch,
    fillPreset,
  };
}
