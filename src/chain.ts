import { Block } from "./block";
import { PublicKeyListInObject, ShareLedger } from "./peer";
import { CreateTransaction, Transaction } from "./transaction";

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
  }

  insertTransaction(transaction: Transaction) {
    if (this.currentBlock) {
      this.currentBlock.insertTransaction(transaction);

      if (this.currentBlock.isFull()) {
        this.currentBlock.closeBlock();

        /**
         * Se bloco estiver cheio, efetivar todas as transações do bloco.
         */
        const feedback = {
          effectTransactionsBlock: this.currentBlock,
        };

        this.currentBlock = new Block(this.currentBlock.id as string);
        this.blocks.push(this.currentBlock);

        return feedback;
      }
    }
  }

  getPublicKey(address: string) {
    return this.publicKeyList.get(address);
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
    const currentBlock = blocks.pop();

    if (!currentBlock) {
      throw new Error("Chain sem currentBlock");
    }

    for (const block of blocks) {
      this.blocks.push(new Block(block.prevBlockId));
    }

    this.currentBlock = new Block(currentBlock.prevBlockId);
    this.blocks.push(this.currentBlock);
  }
}
