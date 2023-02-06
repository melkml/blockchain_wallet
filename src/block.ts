import { CreateTransaction, Transaction } from "./transaction";
import crypto from "crypto";

const AMOUNT_MAX = 10;

export class Block {
  id?: string;
  prevBlockId: string;
  transactions: Transaction[] = [];
  amount: number = 0;
  validate: boolean = false;

  constructor(prevBlockId: string) {
    this.prevBlockId = prevBlockId;
  }

  insertTransaction(transaction: Transaction) {
    this.transactions.push(transaction);
    this.amount++;
  }

  isFull() {
    return this.amount === AMOUNT_MAX;
  }

  closeBlock() {
    this.id = this.generateId(this.prevBlockId);
    this.validate = true;
  }

  private generateId(prevBlockId: string) {
    const hashTransactions = this.transactions.map(
      (transaction) => transaction.id
    );

    const hash = crypto
      .createHash("sha256")
      .update(prevBlockId + hashTransactions)
      .digest("hex");

    return JSON.stringify(hash);
  }
}
