const anchor = require("@coral-xyz/anchor");
const assert = require("assert");


describe("nautilink", () => {
  const provider = anchor.AnchorProvider.local();
  anchor.setProvider(provider);
  
  const program = anchor.workspace.Nautilink;  

  it("Records crate data on-chain", async () => {
    const crateRecord = anchor.web3.Keypair.generate();
    
    const crateId = "CRATE01";
    const weight = 1234; 
    const timestamp = new anchor.BN(Math.floor(Date.now() / 1000));
    const hash = "9f8b24f37c4a";
    const ipfsCid = "bafybeigdyrz7exampleipfshashxyz";

    await program.methods
      .recordCrate(crateId, weight, timestamp, hash, ipfsCid)
      .accounts({

        crateRecord: crateRecord.publicKey,
        authority: provider.wallet.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([crateRecord])
      .rpc();

    const storedRecord = await program.account.crateRecord.fetch(crateRecord.publicKey);


    assert.strictEqual(storedRecord.crateId, crateId);
    assert.strictEqual(storedRecord.weight, weight);
    assert.strictEqual(storedRecord.timestamp.toNumber(), timestamp.toNumber());
    assert.strictEqual(storedRecord.hash, hash);

    assert.strictEqual(storedRecord.ipfsCid, ipfsCid);
    assert.strictEqual(
      storedRecord.authority.toBase58(),
      provider.wallet.publicKey.toBase58()
    );


    console.log("Test passed — crate data recorded successfully!");
  });

});
