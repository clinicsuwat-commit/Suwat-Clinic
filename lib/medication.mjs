import { clean, fail, isDate, today } from "./remote.mjs";

export function stockDispenseItems(source) {
  if (!Array.isArray(source) || !source.length || source.length > 30)
    throw fail(400, "DISPENSE_INVALID");
  const drugIds = new Set();
  return source.map((item) => {
    const drug_id = Number(item?.drug_id);
    const quantity = Number(item?.quantity);
    if (
      !Number.isSafeInteger(drug_id) ||
      drug_id < 1 ||
      !Number.isInteger(quantity) ||
      quantity < 1 ||
      quantity > 10000
    )
      throw fail(400, "DISPENSE_INVALID");
    if (drugIds.has(drug_id)) throw fail(400, "MED_DUPLICATE");
    drugIds.add(drug_id);
    const directions = clean(item.directions, 300);
    if (item.schedule === "variable") return { drug_id, quantity, directions };
    const dose_half_units = Number(item.dose) * 2;
    const times_daily = Number(item.times_daily);
    const started_on = item.started_on;
    const meal_timing = item.meal_timing;
    if (
      item.schedule !== "regular" ||
      !Number.isInteger(dose_half_units) ||
      dose_half_units < 1 ||
      dose_half_units > 40 ||
      dose_half_units > quantity * 2 ||
      !Number.isInteger(times_daily) ||
      times_daily < 1 ||
      times_daily > 8 ||
      !isDate(started_on) ||
      started_on < today() ||
      !["before_food", "after_food", "unspecified"].includes(meal_timing)
    )
      throw fail(400, "MED_SCHEDULE_INVALID");
    return {
      drug_id,
      quantity,
      dose_half_units,
      times_daily,
      started_on,
      meal_timing,
      directions,
    };
  });
}

export function summarizeDispense(row, pending, date) {
  // Deliberately allowlist the LINE member response. The clinical record does not leave the staff API.
  return {
    id: row.id,
    patient_id: row.patient_id,
    dispensed_at: row.dispensed_at,
    item_count: row.items?.length || 0,
    estimated_depletion_on: row.estimated_depletion_on,
    refill_from: row.refill_from,
    refill_until: row.refill_until,
    can_request:
      !!row.refill_from &&
      row.refill_from <= date &&
      row.refill_until >= date &&
      !pending.has(row.id),
  };
}
