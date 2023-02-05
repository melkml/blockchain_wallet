import { CreateTransaction, Transaction } from "./transaction";
import crypto from "crypto";

export class Block {
  id?: string;
  prevBlockId: string;
  transactions: Transaction[] = [];
  validate: boolean = false;

  constructor(prevBlockId: string) {
    this.prevBlockId = prevBlockId;
  }

  insertTransaction(dto: CreateTransaction) {
    this.transactions.push(new Transaction(dto));
  }

  closeBox() {
    this.id = this.generateId(this.prevBlockId);
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
