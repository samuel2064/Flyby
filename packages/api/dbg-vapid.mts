const t0 = Date.now();
console.log("importing web-push...");
const webPush = await import("web-push");
console.log("imported in", Date.now() - t0, "ms");
const t1 = Date.now();
const keys = webPush.generateVAPIDKeys();
console.log("keys generated in", Date.now() - t1, "ms, publicKey len:", keys.publicKey.length);
