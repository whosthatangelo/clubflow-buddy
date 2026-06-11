export type TableStatus =
  | "arriving"
  | "checkin"
  | "at_cashier"
  | "wristbands"
  | "fish_delivered"
  | "bottle_waiting"
  | "bottle_arrived"
  | "reorder"
  | "closed";

// Linear flow (reorder è un evento ripetibile, non uno step)
export const STATUS_ORDER: TableStatus[] = [
  "arriving",
  "at_cashier",
  "wristbands",
  "fish_delivered",
  "bottle_waiting",
  "bottle_arrived",
  "closed",
];

export const STATUS_LABEL: Record<TableStatus, string> = {
  arriving: "In arrivo",
  checkin: "Check-in",
  at_cashier: "In cassa",
  wristbands: "Bracciali consegnati al cliente",
  fish_delivered: "Fish al cameriere",
  bottle_waiting: "Bottiglia in attesa",
  bottle_arrived: "Bottiglia arrivata",
  reorder: "Riordine",
  closed: "Chiuso",
};

export const STATUS_LABEL_SHORT: Record<TableStatus, string> = {
  ...STATUS_LABEL,
  wristbands: "Bracciali consegnati",
};

export function nextStatus(s: TableStatus): TableStatus | null {
  const i = STATUS_ORDER.indexOf(s);
  if (i < 0 || i >= STATUS_ORDER.length - 1) return null;
  return STATUS_ORDER[i + 1];
}

/** Stati che richiedono input prima di passare al successivo (apre sheet). */
export function requiresInput(s: TableStatus): boolean {
  return s === "arriving";
}
