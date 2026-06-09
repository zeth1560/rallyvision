export const BUYER_POSITIONS = [
  'top_left',
  'top_right',
  'bottom_left',
  'bottom_right',
] as const;

export type BuyerPosition = (typeof BUYER_POSITIONS)[number];

export type PlayerNames = Partial<Record<BuyerPosition, string>>;
