import { Block } from "./block";
import { PublicKeyListInObject, ShareLedger } from "./peer";

export class Chain {
  blocks: Block[] = [];
  currentBlock?: Block;
  publicKeyList = new Map<string, string | Buffer>();

  constructor(createGenesis?: boolean) {
    if (createGenesis) {
      this.blocks.push(new Block("0"));
      this.currentBlock = this.blocks.at(0);
    }
  }

  update(chain: ShareLedger) {
    this.setPublicKeyList = chain.publicKeyList;
    this.setBlocks = chain.blocks;
    this.currentBlock = chain.currentBlock;
  }

  setPublicKey(address: string, publicKey: string | Buffer) {
    this.publicKeyList.set(address, publicKey);
  }

  set setPublicKeyList(publicKeyList: PublicKeyListInObject[]) {
    for (const { address, publicKey } of publicKeyList) {
      this.setPublicKey(address, publicKey);
    }
  }

  set setBlocks(blocks: Block[]) {
    this.blocks.push(...blocks);
  }
}
