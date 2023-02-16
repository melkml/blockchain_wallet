import { Peer } from "../peer";
import { TransactionAction } from "../transaction";

interface CommandMapProp {
  peer: Peer;
  value?: string;
  address?: string;
}

export const commandMap: Record<string, any> = {
  "/balance": (prop: CommandMapProp) => {
    console.log(prop.peer.balance);
  },
  "/withdraw": (prop: CommandMapProp) => {
    if (prop.value) {
      prop.peer.startTransaction({
        action: TransactionAction.WITHDRAW,
        actor: prop.peer.address,
        value: +prop.value,
        privateKeyActor: prop.peer.privateKey,
      });
    }
  },
  "/deposit": (prop: CommandMapProp) => {
    if (prop.value) {
      prop.peer.startTransaction({
        action: TransactionAction.DEPOSIT,
        actor: prop.peer.address,
        value: +prop.value,
        privateKeyActor: prop.peer.privateKey,
      });
    }
  },
  "/transfer": (prop: CommandMapProp) => {
    if (prop.address && prop.value) {
      prop.peer.startTransaction({
        action: TransactionAction.TRANSFER,
        actor: prop.peer.address,
        value: +prop.value,
        recipient: prop.address,
        privateKeyActor: prop.peer.privateKey,
      });
    }
  },
  "/exit": (prop: CommandMapProp) => prop.peer.exit(),
};

export const handlerDataProcess = (peer: Peer, data: any) => {
  if (peer.ledger) {
    const message = data.toString().replace(/\n/g, "").trim();

    const dataArray = message.split(" ");

    let command = dataArray.shift();

    command = Object.keys(commandMap).find((key) => command?.includes(key));

    if (!command) {
      return console.log("Nenhum comando reconhecido.");
    }

    const value = dataArray.shift();
    const address = dataArray.shift();

    if (address) {
      const hasTagert = peer.addressConnecteds.includes(address.toString());

      if (!hasTagert) {
        return console.log("O endereço informado não está na rede");
      }
    }

    commandMap[command as string]({ peer, value, address });
  }
};
