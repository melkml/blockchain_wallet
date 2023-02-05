import { Peer } from "./peer";

const port: string = process.argv.at(2) || "1000";

const peer = new Peer("localhost:" + port);

// process.stdin.on("data", (data) => handleData(peer, data));

process.argv.slice(3).forEach((anotherPeerAddress) => {
  peer.connect(anotherPeerAddress);
});
