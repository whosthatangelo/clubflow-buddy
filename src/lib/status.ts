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

export const STATUS_ORDER: TableStatus[] = [
  "arriving",
  "checkin",
  "at_cashier",
  "wristbands",
  "fish_delivered",
  "bottle_waiting",
  "bottle_arrived",
  "reorder",
  "closed",
];

export const STATUS_LABEL: Record<TableStatus, string> = {
  arriving: "In arrivo",
  checkin: "Check-in",
  at_cashier: "In cassa",
  wristbands: "Bracciali ritirati",
  fish_delivered: "Fish al cameriere",
  bottle_waiting: "Bottiglia in attesa",
  bottle_arrived: "Bottiglia arrivata",
  reorder: "Riordine",
  closed: "Chiuso",
};

export function nextStatus(s: TableStatus): TableStatus | null {
  const i = STATUS_ORDER.indexOf(s);
  if (i < 0 || i >= STATUS_ORDER.length - 1) return null;
  return STATUS_ORDER[i + 1];
}
