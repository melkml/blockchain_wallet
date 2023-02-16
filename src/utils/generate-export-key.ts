import crypto from "crypto";

const GenerateExportKey = (key: string, type: "private" | "public") => {
  const method = type === "private" ? "createPrivateKey" : "createPublicKey";

  return crypto[method]({
    key: key,
    format: "pem",
    type: "pkcs1",
    passphrase: type === "private" ? "" : undefined,
  }).export({
    format: "pem",
    type: "pkcs1",
  });
};

export const GeneratePairKey = () => {
  const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", {
    modulusLength: 4096,
    publicKeyEncoding: {
      type: "spki",
      format: "pem",
    },
    privateKeyEncoding: {
      type: "pkcs8",
      format: "pem",
      cipher: "aes-256-cbc",
      passphrase: "",
    },
  });

  return {
    privateKey: GenerateExportKey(privateKey, "private"),
    publicKey: GenerateExportKey(publicKey, "public"),
  };
};
