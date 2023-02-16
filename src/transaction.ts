import * as crypto from "crypto";
import { Key } from "./peer";

export interface CreateTransaction {
  action: TransactionAction;
  actor: string;
  privateKeyActor: Key;
  recipient?: string;
  value: number;
}

export enum TransactionAction {
  WITHDRAW = "withdraw",
  TRANSFER = "transfer",

  DEPOSIT = "deposit",
}

export interface TransactionData {
  actor: string;
  recipient?: string;
  action: TransactionAction;
  timestamp: Date;
  value: number;
}

export class Transaction {
  id: Buffer;
  data: TransactionData;

  constructor(transactionDto: CreateTransaction) {
    const { actor, recipient, action, value, privateKeyActor } = transactionDto;

    this.data = {
      actor,
      recipient,
      value,
      action,
      timestamp: new Date(),
    };

    this.id = this.generateId(privateKeyActor);
  }

  private generateId(privateKey: Key) {
    const data = Buffer.from(JSON.stringify(this.data));

    return crypto.sign("SHA256", data, privateKey);
  }

  private is(action: TransactionAction) {
    return this.data.action === action;
  }
}
