import { createServer, Socket } from "net";
import { PeerActionData, PeerBroadcastAction } from "./peer-action";
import { Chain } from "./chain";
import { GeneratePairKey } from "./utils/generate-export-key";
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
  static amountProsWishes = 0;
  static amountConsWishes = 0;
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

    const { publicKey, privateKey } = GeneratePairKey();
    this.privateKey = privateKey;
    this.publicKey = publicKey;

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
        //Verificando se pode realizar requisição de transação
        let balance = this.calculatePostTransactionBalance(
          transaction,
          this.calculateBalanceByAddress(this.address)
        );

        if (balance < 0) {
          return console.log("Você não possui saldo para essa transação");
        }

        Peer.processingTransaction++;
        this.broadcast({
          action: PeerBroadcastAction.REQUEST_INSERT_TRANSACTION,
          data: transaction,
        });
      }
    }
  }

  private handleData(socket: Socket, data: string | Buffer) {
    let peerAction: PeerActionData;

    try {
      peerAction = JSON.parse(data.toString());
    } catch (e) {
      peerAction = JSON.parse(JSON.stringify(data));
    }

    console.log(`HANDLE-DATA`, peerAction);

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

        const response = {
          action: PeerBroadcastAction.CAN_INSERT_TRANSACTION,
          data: {
            transaction: peerAction.data,
            validate: canInsert,
          },
        };

        socket.write(JSON.stringify(response));

        break;
      case PeerBroadcastAction.CAN_INSERT_TRANSACTION:
        const { transaction, validate } = peerAction.data;

        const wishes = validate ? "amountProsWishes" : "amountConsWishes";

        Peer[wishes]++;

        const canTryInsert =
          Peer.amountConsWishes + Peer.amountProsWishes ===
          this.addressConnecteds.length;

        if (canTryInsert) {
          const validateByWishes =
            Peer.amountProsWishes >= this.addressConnecteds.length / 2;

          if (validateByWishes) {
            this.insertTransaction(transaction);

            this.broadcast({
              action: PeerBroadcastAction.INSERT_TRANSACTION,
              data: {
                transaction,
              },
            });
          }
        }
        break;
      case PeerBroadcastAction.INSERT_TRANSACTION:
        this.insertTransaction(peerAction.data.transaction);
        break;
      case PeerBroadcastAction.EXIT:
        if (this.ledger) {
          console.log(peerAction.data + " saiu da sala");
          this.ledger.publicKeyList.delete(peerAction.data);
        }

        break;
    }
  }

  private insertTransaction(transaction: Transaction) {
    if (this.ledger) {
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

      Peer.amountConsWishes = 0;
      Peer.amountProsWishes = 0;
      Peer.processingTransaction--;
    }
  }

  private effectTransactionsBlock(block: Block) {
    for (const transaction of block.transactions) {
      this.balance = this.calculatePostTransactionBalance(
        transaction,
        this.balance
      );
    }
  }

  private verifyTransactionData(transaction: Transaction) {
    const currentBalance = this.calculateBalanceByAddress(
      transaction.data.actor
    );

    const newBalance = this.calculatePostTransactionBalance(
      transaction,
      currentBalance,
      transaction.data.actor
    );

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

  private calculateBalanceByAddress(address: string) {
    const transactions = this.filterTransactionsByAddress(address);

    let balance = DEFAULT_BALANCE;

    for (const transaction of transactions) {
      balance = this.calculatePostTransactionBalance(
        transaction,
        balance,
        address
      );
    }

    return balance;
  }

  /**
   * Calcula saldo depois de uma transação
   * @param transaction
   * @param balance
   * @param address
   * @private
   */
  private calculatePostTransactionBalance(
    transaction: Transaction,
    balance: number,
    address?: string
  ) {
    address ||= this.address;

    switch (transaction.data.action) {
      case TransactionAction.WITHDRAW:
        if (transaction.data.actor === address) {
          balance -= transaction.data.value;
        }
        break;
      case TransactionAction.DEPOSIT:
        if (transaction.data.actor === address) {
          balance += transaction.data.value;
        }
        break;
      case TransactionAction.TRANSFER: {
        if (transaction.data.actor === address) {
          balance -= transaction.data.value;
        }

        if (transaction.data.recipient === address) {
          balance += transaction.data.value;
        }
        break;
      }
    }

    return balance;
  }

  private filterTransactionsByAddress(address: string) {
    if (this.ledger) {
      let transactions = [];

      for (const block of this.ledger.blocks) {
        const filtereds = block.transactions.filter((transaction) => {
          return [transaction.data.actor, transaction.data.recipient].includes(
            address
          );
        });

        transactions.push(...filtereds);
      }

      return transactions;
    }

    return [];
  }

  private prepareListeners(socket: Socket) {
    welcome();
    socket.on("data", (data) => {
      this.handleData(socket, data);
    });

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
