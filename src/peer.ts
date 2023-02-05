import { createServer, Socket } from "net";
import { PeerActionData, PeerBroadcastAction } from "./peer-action";
import { Chain } from "./chain";
import { GenerateKey, GenerateStringKey } from "./utils/generate-key";
import { CreateTransaction, Transaction } from "./transaction";
import * as crypto from "crypto";

export type Key = string | Buffer;

export type PublicKeyListInObject = {
  address: string;
  publicKey: Key;
};
export type ShareLedger = Chain & {
  publicKeyList: PublicKeyListInObject[];
};

export class Peer {
  address: string;
  addressConnecteds: string[] = [];
  readonly privateKey: Key;
  readonly publicKey: Key;
  ledger?: Chain;
  socket: Socket | undefined;
  connections: Socket[] = [];
  static amoutWishes = 0;
  static processingTransaction = 0;

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
    console.log("CONTEXT", peerAction.action);

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
        while (Peer.processingTransaction !== 0) {}
        Peer.processingTransaction++;

        const canInsert = this.verifyTransaction(peerAction.data);

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
    }
  }

  private tryInsertTransaction(transaction: Transaction, validate: boolean) {
    if (validate) Peer.amoutWishes++;

    const canInsertTransaction =
      Peer.amoutWishes >= this.addressConnecteds.length / 2;

    if (this.ledger && canInsertTransaction) {
      this.ledger.insertTransaction(transaction);
      Peer.amoutWishes = 0;
      Peer.processingTransaction--;
      console.log("Transaction inserida.", this.ledger.currentBlock);
    }
  }

  private verifyTransaction(transaction: Transaction) {
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

  private prepareListeners(socket: Socket) {
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
