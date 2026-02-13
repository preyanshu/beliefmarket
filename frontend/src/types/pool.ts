export enum OrderStatus {
  PENDING = 0,
  MATCHED = 1,
  PARTIALLY_MATCHED = 2,
  CANCELLED = 3,
  REFUNDED = 4,
}

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  [OrderStatus.PENDING]: "Pending",
  [OrderStatus.MATCHED]: "Matched",
  [OrderStatus.PARTIALLY_MATCHED]: "Partial",
  [OrderStatus.CANCELLED]: "Cancelled",
  [OrderStatus.REFUNDED]: "Refunded",
};

export const ORDER_STATUS_COLORS: Record<OrderStatus, string> = {
  [OrderStatus.PENDING]: "text-yellow-400",
  [OrderStatus.MATCHED]: "text-green-400",
  [OrderStatus.PARTIALLY_MATCHED]: "text-blue-400",
  [OrderStatus.CANCELLED]: "text-gray-400",
  [OrderStatus.REFUNDED]: "text-orange-400",
};

export interface OrderData {
  trader: string;
  isBuy: boolean;
  deposit: bigint;
  encryptedOrder: string;
  status: number;
  createdAt: bigint;
  settledPrice: bigint;
  settledAmount: bigint;
}

export interface SettlementData {
  clearingPrice: bigint;
  matchedVolume: bigint;
  totalTrades: bigint;
  timestamp: bigint;
}
