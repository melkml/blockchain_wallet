import { createServer, Socket } from "net";
import * as crypto from "crypto";
import { PeerActionData, PeerBroadcastAction } from "./peer-action";
import { Chain } from "./chain";
import { GenerateKey, GenerateStringKey } from "./utils/generate-key";

export type PublicKeyListInObject = {
  address: string;
  publicKey: string | Buffer;
};
export type ShareLedger = Chain & {
  publicKeyList: PublicKeyListInObject[];
};

export class Peer {
  address: string;
  private readonly privateKey: string | Buffer;
  readonly publicKey: string | Buffer;
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

  private handleData(socket: Socket, data: string | Buffer) {
    const peerAction = JSON.parse(data.toString()) as PeerActionData;

    switch (peerAction.action) {
      case PeerBroadcastAction.SHARE_LEDGER:
        this.ledger = new Chain();
        this.ledger.setPublicKeyList = peerAction.data.publicKeyList;
        this.ledger.setPublicKey(this.address, this.publicKey);
        this.ledger.setBlocks = peerAction.data.blocks;

        break;
      case PeerBroadcastAction.SHARE_PUBLIC_KEY:
        if (this.ledger) {
          const { address, publicKey } = peerAction.data;
          this.ledger.setPublicKey(address, publicKey);
        }
        break;
    }
  }

  private prepareListeners(socket: Socket) {
    socket.on("data", (data) => this.handleData(socket, data));

    socket.on("end", () => {
      this.connections = this.connections.filter((conn) => {
        return conn !== socket;
      });
    });
  }

  broadcast(peerAction: PeerActionData) {
    this.connections.forEach((socket) => {
      socket.write(JSON.stringify(peerAction));
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
