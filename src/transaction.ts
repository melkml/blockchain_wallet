import * as crypto from "crypto";

export interface CreateTransaction {
  action: TransactionAction;
  actor: string;
  privateKeyActor: string;
  recipient?: string;
  value: number;
}

export enum TransactionAction {
  WITHDRAW = "withdraw",
  TRANFER = "transfer",
}

export class Transaction {
  id: string;
  actor: string;
  recipient?: string;
  action: TransactionAction;
  timestamp: Date;
  value: number;

  constructor(transactionDto: CreateTransaction) {
    const { actor, recipient, action, value, privateKeyActor } = transactionDto;

    this.actor = actor;
    this.recipient = recipient;
    this.value = value;
    this.action = action;
    this.timestamp = new Date();
    this.id = this.generateId(privateKeyActor);
  }

  private generateId(privateKeyActor: string) {
    const transaction = Buffer.from(JSON.stringify(this));

    const assignture = crypto.sign("SHA256", transaction, privateKeyActor);

    return JSON.stringify(assignture);
  }

  private is(action: TransactionAction) {
    return this.action === action;
  }
}
