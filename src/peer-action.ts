import { Socket } from "net";

export enum PeerBroadcastAction {
  SHARE_LEDGER = "share-ledger",
  SHARE_PUBLIC_KEY = "share-public-key",
  REQUEST_INSERT_TRANSACTION = "request-insert-transaction",
  CAN_INSERT_TRANSACTION = "can-insert-transaction",
}

export interface PeerActionData {
  action: PeerBroadcastAction;
  actor?: string;
  subject?: string;
  data?: any;
  socket?: Socket;
}
