import { createServer, Socket } from "net";
import { PeerActionData, PeerBroadcastAction } from "./peer-action";
import { Chain } from "./chain";
import { GenerateKey, GenerateStringKey } from "./utils/generate-key";
import {
  CreateTransaction,
  Transaction,
  TransactionAction,
} from "./transaction";
import * as crypto from "crypto";
import { Await } from "./utils/await";
import { Block } from "./block";
import { welcome } from "./cli/welcome";

export type Key = string | Buffer;

export type PublicKeyListInObject = {
  address: string;
  publicKey: Key;
};
export type ShareLedger = Chain & {
  publicKeyList: PublicKeyListInObject[];
};

export const DEFAULT_BALANCE = 100;

export class Peer {
  static amoutWishes = 0;
  static processingTransaction = 0;

  address: string;
  addressConnecteds: string[] = [];
  privateKey: Key;
  publicKey: Key;
  balance: number = DEFAULT_BALANCE;
  ledger?: Chain;
  socket: Socket | undefined;
  connections: Socket[] = [];

  constructor(address: string) {
    this.address = address;

    const { publicKey, privateKey } = GenerateStringKey();
    this.privateKey = GenerateKey(privateKey, "private");
    this.publicKey = GenerateKey(publicKey, "public");

    const server = createServer((socket) => {
      this.connections.push(socket);
      this.prepareListeners(socket);

      if (!this.ledger) {
        this.ledger = new Chain(true);
        this.ledger.setPublicKey(this.address, this.publicKey);
      }

      const data: PeerActionData = {
        action: PeerBroadcastAction.SHARE_LEDGER,
        data: this.prepareShareLedger(),
      };

      socket.write(JSON.stringify(data));

      console.log("OK");
    });

    const port = address.split(":").at(1);

    server.listen(port, () =>
      console.log("Servidor aberto, aguardando alguém se conectar...")
    );
  }

  connect(address: string) {
    const [host, port] = address.split(":");

    this.socket = new Socket();

    this.socket.connect(+port, host, () => {
      this.addressConnecteds.push(address);
      this.onConnect();
    });
  }

  onConnect() {
    if (this.socket) {
      console.log("OK");
      this.connections.push(this.socket);
      this.prepareListeners(this.socket);

      const data = {
        action: PeerBroadcastAction.SHARE_PUBLIC_KEY,
        data: {
          address: this.address,
          publicKey: this.publicKey,
        },
      };
      this.socket.write(JSON.stringify(data));
    }
  }

  broadcast(peerAction: PeerActionData) {
    this.connections.forEach((socket) => {
      socket.write(JSON.stringify(peerAction));
    });
  }

  exit() {
    this.broadcast({
      action: PeerBroadcastAction.EXIT,
      data: this.address,
    });

    this.connections.forEach((connection) => {
      connection.end();
    });

    this.connections = [];
    this.ledger = undefined;
    this.addressConnecteds = [];

    console.log("Você saiu da Melkarteira.");
  }

  startTransaction(dto: CreateTransaction) {
    if (this.ledger && this.ledger.currentBlock) {
      const transaction = new Transaction(dto);

      if (transaction) {
        Peer.processingTransaction++;
        this.broadcast({
          action: PeerBroadcastAction.REQUEST_INSERT_TRANSACTION,
          data: transaction,
        });
      }
    }
  }

  private handleData(socket: Socket, data: string | Buffer) {
    const peerAction = JSON.parse(data.toString()) as PeerActionData;
    // console.log("CONTEXT", peerAction.action);

    switch (peerAction.action) {
      case PeerBroadcastAction.SHARE_LEDGER:
        if (!this.ledger) {
          const publicKeyList = peerAction.data
            .publicKeyList as PublicKeyListInObject[];

          this.ledger = new Chain();
          this.ledger.update(peerAction.data);
          this.ledger.setPublicKey(this.address, this.publicKey);

          // Se conectando a todos os outros peers da rede.

          publicKeyList.forEach(({ address }) => {
            if (!this.addressConnecteds.includes(address)) {
              this.connect(address);
            }
          });
        }
        break;
      case PeerBroadcastAction.SHARE_PUBLIC_KEY:
        if (this.ledger) {
          const { address, publicKey } = peerAction.data;
          this.ledger.setPublicKey(address, publicKey);

          this.addressConnecteds.push(address);
        }
        break;
      case PeerBroadcastAction.REQUEST_INSERT_TRANSACTION:
        //Condição para aguardar enquanto transações estiverem sendo processada
        Await(Peer.processingTransaction !== 0);

        Peer.processingTransaction++;

        const canInsert =
          this.verifySignature(peerAction.data) &&
          this.verifyTransactionData(peerAction.data);

        this.broadcast({
          action: PeerBroadcastAction.CAN_INSERT_TRANSACTION,
          data: {
            transaction: peerAction.data,
            validate: canInsert,
          },
        });

        this.tryInsertTransaction(peerAction.data, canInsert);

        break;
      case PeerBroadcastAction.CAN_INSERT_TRANSACTION:
        const { transaction, validate } = peerAction.data;

        this.tryInsertTransaction(transaction, validate);
        break;
      case PeerBroadcastAction.EXIT:
        if (this.ledger) {
          console.log(peerAction.data + " saiu da sala");
          this.ledger.publicKeyList.delete(peerAction.data);
        }

        break;
    }
  }

  private tryInsertTransaction(transaction: Transaction, validate: boolean) {
    if (validate) Peer.amoutWishes++;

    const validateByWishes =
      Peer.amoutWishes >= this.addressConnecteds.length / 2;

    if (this.ledger && validateByWishes) {
      const feedback = this.ledger.insertTransaction(transaction);
      console.log("Transação registrada!");

      /**
       * Efetivando transactions se o bloco for fechado
       */
      if (feedback?.effectTransactionsBlock) {
        this.effectTransactionsBlock(feedback.effectTransactionsBlock);
        console.log("Mudança de bloco...");
        console.log("Seu saldo:", this.balance);
      }

      Peer.amoutWishes = 0;
      Peer.processingTransaction--;
    }
  }

  private effectTransactionsBlock(block: Block) {
    for (const transaction of block.transactions) {
      this.balance = this.calculateDiffBalance(transaction, this.balance);
    }
  }

  private verifyTransactionData(transaction: Transaction) {
    const currentBalance = this.calculeBalanceByAddress(transaction.data.actor);
    const newBalance = this.calculateDiffBalance(transaction, currentBalance);
    return newBalance >= 0;
  }

  private verifySignature(transaction: Transaction) {
    const { data, id } = transaction;

    const publicKeyActor = this.ledger?.getPublicKey(data.actor);

    if (publicKeyActor) {
      return crypto.verify(
        "sha256",
        Buffer.from(JSON.stringify(data)),
        publicKeyActor,
        Buffer.from(id)
      );
    }

    return false;
  }

  private calculeBalanceByAddress(address: string) {
    const transactions = this.filterTransactionByAddress(address);

    let balance = DEFAULT_BALANCE;

    for (const transaction of transactions) {
      balance = this.calculateDiffBalance(transaction, balance);
    }

    return balance;
  }

  private calculateDiffBalance(transaction: Transaction, balance: number) {
    switch (transaction.data.action) {
      case TransactionAction.WITHDRAW:
        balance -= transaction.data.value;
        break;
      case TransactionAction.TRANSFER: {
        if (transaction.data.actor === this.address) {
          balance -= transaction.data.value;
        }

        if (transaction.data.recipient === this.address) {
          balance += transaction.data.value;
        }
        break;
      }
    }

    return balance;
  }

  private filterTransactionByAddress(address: string) {
    if (this.ledger) {
      let transactions = [];

      for (const block of this.ledger.blocks) {
        const filtereds = block.transactions.filter((transaction) =>
          [transaction.data.actor, transaction.data.recipient].includes(address)
        );

        transactions.push(...filtereds);
      }

      return transactions;
    }

    return [];
  }

  private prepareListeners(socket: Socket) {
    welcome();
    socket.on("data", (data) => this.handleData(socket, data));

    socket.on("end", () => {
      this.connections = this.connections.filter((conn) => {
        return conn !== socket;
      });
    });
  }

  private prepareShareLedger(): ShareLedger | undefined {
    if (!this.ledger) return undefined;

    const clone = JSON.parse(JSON.stringify(this.ledger));

    return Object.assign(clone, {
      publicKeyList: Array.from(
        this.ledger.publicKeyList,
        ([address, publicKey]) => ({
          address,
          publicKey,
        })
      ),
    });
  }
}
