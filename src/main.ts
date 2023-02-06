import { Peer } from "./peer";
import { TransactionAction } from "./transaction";

const port: string = process.argv.at(2) || "1000";

const peer = new Peer("localhost:" + port);

process.stdin.on("data", (data) =>
  peer.startTransaction({
    action: TransactionAction.WITHDRAW,
    actor: "localhost:" + port,
    privateKeyActor: peer.privateKey,
    value: 5,
  })
);

process.argv.slice(3).forEach((anotherPeerAddress) => {
  peer.connect(anotherPeerAddress);
});
