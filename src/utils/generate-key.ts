import crypto from "crypto";

export const GenerateKey = (key: string, type: "private" | "public") => {
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

export const GenerateStringKey = () =>
  crypto.generateKeyPairSync("rsa", {
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
