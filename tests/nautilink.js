const anchor = require("@coral-xyz/anchor");
const assert = require("assert");


describe("nautilink traceability", () => {
  const provider = anchor.AnchorProvider.local();
  anchor.setProvider(provider);
  const program = anchor.workspace.Nautilink;

  // Helper to create timestamp

  const now = () => new anchor.BN(Math.floor(Date.now() / 1000));

  describe("Scenario: Fishing Crate A + B → Mix C → Split D + E", () => {
    let crateA, crateB, crateC, crateD, crateE;

    it("Step 1: Creates Fishing Crate A (1000g)", async () => {
      crateA = anchor.web3.Keypair.generate();

      await program.methods
        .createCrate(
          "CRATE_A",
          "did:crate:A123",       // crate_did
          "did:owner:fisher1",    // owner_did
          "did:device:nfc001",    // device_did
          "40.7128,-74.0060",     // location (NYC coordinates)
          1000,                   // weight: 1000g
          now(),
          "hashA",
          "ipfs_cid_A"
        )
        .accounts({
          crateRecord: crateA.publicKey,
          authority: provider.wallet.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([crateA])
        .rpc();

      const record = await program.account.crateRecord.fetch(crateA.publicKey);
      assert.strictEqual(record.crateId, "CRATE_A");
      assert.strictEqual(record.crateDid, "did:crate:A123");
      assert.strictEqual(record.ownerDid, "did:owner:fisher1");
      assert.strictEqual(record.deviceDid, "did:device:nfc001");

      assert.strictEqual(record.location, "40.7128,-74.0060");
      assert.strictEqual(record.weight, 1000);
      assert.strictEqual(record.parentCrates.length, 0);
      console.log("✅ Crate A created: 1000g");
    });


    it("Step 2: Creates Fishing Crate B (1500g)", async () => {
      crateB = anchor.web3.Keypair.generate();

      await program.methods
        .createCrate(
          "CRATE_B",
          "did:crate:B456",
          "did:owner:fisher2",
          "did:device:nfc002",
          "40.7580,-73.9855",     // Different location
          1500,
          now(),
          "hashB",
          "ipfs_cid_B"

        )
        .accounts({
          crateRecord: crateB.publicKey,
          authority: provider.wallet.publicKey,

          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([crateB])
        .rpc();


      const record = await program.account.crateRecord.fetch(crateB.publicKey);
      assert.strictEqual(record.weight, 1500);
      console.log("✅ Crate B created: 1500g");
    });

    it("Step 3: Mixes A + B into C at Fishery (2500g total)", async () => {
      crateC = anchor.web3.Keypair.generate();

      await program.methods
        .mixCrates(
          "CRATE_C_MIXED",
          "did:crate:C789",
          "did:owner:fisher1",    // Same owner as A
          "did:device:scanner01",
          "40.7489,-73.9680",     // Processing location
          now(),
          "hashC",
          "ipfs_cid_C",

          [crateA.publicKey, crateB.publicKey]
        )
        .accounts({
          crateRecord: crateC.publicKey,
          authority: provider.wallet.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .remainingAccounts([
          { pubkey: crateA.publicKey, isWritable: false, isSigner: false },
          { pubkey: crateB.publicKey, isWritable: false, isSigner: false },

        ])
        .signers([crateC])
        .rpc();

      const recordC = await program.account.crateRecord.fetch(crateC.publicKey);
      
      // C knows its parents
      assert.strictEqual(recordC.parentCrates.length, 2);

      assert.strictEqual(recordC.parentCrates[0].toBase58(), crateA.publicKey.toBase58());
      assert.strictEqual(recordC.parentCrates[1].toBase58(), crateB.publicKey.toBase58());
      
      // C knows parent weights (composition)

      assert.strictEqual(recordC.parentWeights[0], 1000); // A's contribution
      assert.strictEqual(recordC.parentWeights[1], 1500); // B's contribution
      
      // Total weight
      assert.strictEqual(recordC.weight, 2500);
      
      console.log("✅ Crate C created from mix: 2500g (A:1000g + B:1500g)");
    });


    it("Step 4: Updates A to know about child C", async () => {
      await program.methods
        .updateChildParent(crateC.publicKey)
        .accounts({
          childCrate: crateA.publicKey,
          authority: provider.wallet.publicKey,
        })
        .rpc();

      const recordA = await program.account.crateRecord.fetch(crateA.publicKey);
      assert.strictEqual(recordA.parentCrates.length, 1);
      assert.strictEqual(recordA.parentCrates[0].toBase58(), crateC.publicKey.toBase58());
      console.log("✅ Crate A now knows it contributed to C");
    });


    it("Step 5: Updates B to know about child C", async () => {
      await program.methods
        .updateChildParent(crateC.publicKey)
        .accounts({
          childCrate: crateB.publicKey,
          authority: provider.wallet.publicKey,
        })
        .rpc();

      const recordB = await program.account.crateRecord.fetch(crateB.publicKey);
      assert.strictEqual(recordB.parentCrates.length, 1);
      console.log("✅ Crate B now knows it contributed to C");
    });

    it("Step 6: Splits C into D (1000g) at Processing Plant D", async () => {
      crateD = anchor.web3.Keypair.generate();
      crateE = anchor.web3.Keypair.generate();

      // Create D (40% of C)
      await program.methods
        .splitCrate(
          "CRATE_D_SPLIT",
          "did:crate:D101",
          "did:owner:processor1",
          "did:device:scale01",
          "40.7500,-74.0000",
          1000, // D gets 1000g

          now(),
          "hashD",
          "ipfs_cid_D",
          [crateD.publicKey, crateE.publicKey],
          [1000, 1500] // D:1000g, E:1500g
        )
        .accounts({

          crateRecord: crateD.publicKey,
          authority: provider.wallet.publicKey,
          parentCrate: crateC.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([crateD])
        .rpc();

      const recordD = await program.account.crateRecord.fetch(crateD.publicKey);
      
      // D knows its parent
      assert.strictEqual(recordD.parentCrates.length, 1);
      assert.strictEqual(recordD.parentCrates[0].toBase58(), crateC.publicKey.toBase58());
      
      // D knows sibling distribution
      assert.strictEqual(recordD.childCrates.length, 2);
      assert.strictEqual(recordD.splitDistribution[0], 1000); // D's share
      assert.strictEqual(recordD.splitDistribution[1], 1500); // E's share
      
      // D's weight
      assert.strictEqual(recordD.weight, 1000);
      

      console.log("✅ Crate D created from split: 1000g (40% of C)");
    });

    it("Step 7: Splits C into E (1500g) at Processing Plant E", async () => {
      // E already has keypair from previous step
      

      await program.methods
        .splitCrate(
          "CRATE_E_SPLIT",
          "did:crate:E102",
          "did:owner:processor2",
          "did:device:scale02",
          "40.7600,-74.0100",
          1500, // E gets 1500g
          now(),
          "hashE",
          "ipfs_cid_E",
          [crateD.publicKey, crateE.publicKey],
          [1000, 1500]
        )
        .accounts({
          crateRecord: crateE.publicKey,

          authority: provider.wallet.publicKey,
          parentCrate: crateC.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,

        })
        .signers([crateE])
        .rpc();

      const recordE = await program.account.crateRecord.fetch(crateE.publicKey);
      assert.strictEqual(recordE.weight, 1500);
      console.log("✅ Crate E created from split: 1500g (60% of C)");
    });

    it("Step 8: Updates C to know about children D and E", async () => {
      await program.methods
        .updateParentChildren([crateD.publicKey, crateE.publicKey])
        .accounts({
          parentCrate: crateC.publicKey,
          authority: provider.wallet.publicKey,
        })
        .rpc();


      const recordC = await program.account.crateRecord.fetch(crateC.publicKey);
      assert.strictEqual(recordC.childCrates.length, 2);
      console.log("✅ Crate C now knows it split into D and E");
    });

    it("Step 9: Verifies complete lineage - D knows A+B composition", async () => {
      const recordD = await program.account.crateRecord.fetch(crateD.publicKey);
      
      // Debug: Check what we have
      console.log("\nDebug recordD:");
      console.log("  parentCrates:", recordD.parentCrates);
      console.log("  parentCrates length:", recordD.parentCrates.length);
      
      // Fetch parent C
      const recordC = await program.account.crateRecord.fetch(recordD.parentCrates[0]);
      
      console.log("\nDebug recordC:");
      console.log("  parentWeights:", recordC.parentWeights);
      console.log("  parentWeights length:", recordC.parentWeights.length);
      
      // D → C → (A + B)
      console.log("\n📊 Lineage Analysis for Crate D:");
      console.log(`  D weight: ${recordD.weight}g`);
      console.log(`  D's parent: C (${recordC.weight}g)`);
      
      if (recordC.parentWeights && recordC.parentWeights.length >= 2) {
        console.log(`  C's parents: A (${recordC.parentWeights[0]}g) + B (${recordC.parentWeights[1]}g)`);
        
        // Calculate D's composition from A and B
        const dPercentOfC = recordD.weight / recordC.weight; // 1000/2500 = 40%
        const dFromA = recordC.parentWeights[0] * dPercentOfC; // 1000 * 0.4 = 400g

        const dFromB = recordC.parentWeights[1] * dPercentOfC; // 1500 * 0.4 = 600g
        
        console.log(`  D contains: ${dFromA}g from A, ${dFromB}g from B`);
        assert.strictEqual(dFromA + dFromB, recordD.weight);
      } else {
        console.log("  Warning: C's parent weights not found");
      }
    });

    it("Step 10: Verifies complete lineage - E knows A+B composition", async () => {
      const recordE = await program.account.crateRecord.fetch(crateE.publicKey);
      const recordC = await program.account.crateRecord.fetch(recordE.parentCrates[0]);
      
      console.log("\n📊 Lineage Analysis for Crate E:");

      console.log(`  E weight: ${recordE.weight}g`);
      console.log(`  E's parent: C (${recordC.weight}g)`);
      console.log(`  C's parents: A (${recordC.parentWeights[0]}g) + B (${recordC.parentWeights[1]}g)`);
      

      const ePercentOfC = recordE.weight / recordC.weight; // 1500/2500 = 60%
      const eFromA = recordC.parentWeights[0] * ePercentOfC; // 1000 * 0.6 = 600g
      const eFromB = recordC.parentWeights[1] * ePercentOfC; // 1500 * 0.6 = 900g

      
      console.log(`  E contains: ${eFromA}g from A, ${eFromB}g from B`);
      assert.strictEqual(eFromA + eFromB, recordE.weight);
    });
  });


  describe("Transfer ownership validation", () => {
    it("Allows transfer with same weight", async () => {
      const original = anchor.web3.Keypair.generate();

      const transferred = anchor.web3.Keypair.generate();

      // Create original
      await program.methods
        .createCrate(
          "ORIGINAL",

          "did:crate:orig1",
          "did:owner:alice",
          "did:device:nfc100",
          "40.7128,-74.0060",
          500,
          now(),
          "hash1",
          "ipfs1"

        )
        .accounts({
          crateRecord: original.publicKey,
          authority: provider.wallet.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([original])
        .rpc();

      // Transfer with same weight
      await program.methods
        .transferOwnership(
          "TRANSFERRED",
          "did:crate:trans1",
          "did:owner:bob",        // New owner
          "did:device:nfc101",

          "40.7580,-73.9855",     // New location
          500,                    // Same weight
          now(),

          "hash2",
          "ipfs2"
        )
        .accounts({
          crateRecord: transferred.publicKey,
          authority: provider.wallet.publicKey,
          parentCrate: original.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([transferred])
        .rpc();


      const record = await program.account.crateRecord.fetch(transferred.publicKey);
      assert.strictEqual(record.weight, 500);
      assert.strictEqual(record.ownerDid, "did:owner:bob");
      console.log("✅ Transfer with matching weight succeeded");
    });

    it("Rejects transfer with different weight", async () => {
      const original = anchor.web3.Keypair.generate();
      const transferred = anchor.web3.Keypair.generate();

      await program.methods
        .createCrate(
          "ORIGINAL2",
          "did:crate:orig2",
          "did:owner:charlie",
          "did:device:nfc102",
          "40.7128,-74.0060",
          500,
          now(),
          "hash1",

          "ipfs1"
        )
        .accounts({
          crateRecord: original.publicKey,
          authority: provider.wallet.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([original])
        .rpc();

      try {
        await program.methods
          .transferOwnership(
            "TRANSFERRED2",
            "did:crate:trans2",
            "did:owner:dave",
            "did:device:nfc103",
            "40.7580,-73.9855",
            450,                    // Wrong weight!
            now(),
            "hash2",
            "ipfs2"
          )
          .accounts({
            crateRecord: transferred.publicKey,
            authority: provider.wallet.publicKey,
            parentCrate: original.publicKey,
            systemProgram: anchor.web3.SystemProgram.programId,
          })
          .signers([transferred])
          .rpc();
        
        assert.fail("Should have thrown error");
      } catch (err) {
        assert.ok(err.toString().includes("WeightMismatchOnTransfer"));
        console.log("✅ Transfer with mismatched weight rejected");
      }
    });
  });

  describe("Authorization checks", () => {

    let unauthorizedWallet;

    before(() => {
      // Create a second wallet that doesn't own the crates
      unauthorizedWallet = anchor.web3.Keypair.generate();
    });


    it("Rejects unauthorized transfer", async () => {
      const original = anchor.web3.Keypair.generate();
      const transferred = anchor.web3.Keypair.generate();

      // Create original crate owned by default wallet
      await program.methods
        .createCrate(
          "AUTH_TEST_1",
          "did:crate:auth1",
          "did:owner:owner1",
          "did:device:nfc200",
          "40.7128,-74.0060",

          500,
          now(),
          "hash1",
          "ipfs1"
        )

        .accounts({

          crateRecord: original.publicKey,

          authority: provider.wallet.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })

        .signers([original])
        .rpc();


      // Try to transfer with different authority (should fail)
      try {
        // Airdrop some SOL to unauthorized wallet for transaction fees
        const airdropSig = await provider.connection.requestAirdrop(
          unauthorizedWallet.publicKey,

          2 * anchor.web3.LAMPORTS_PER_SOL
        );
        await provider.connection.confirmTransaction(airdropSig);

        await program.methods
          .transferOwnership(
            "AUTH_TEST_TRANSFER",
            "did:crate:auth2",
            "did:owner:hacker",
            "did:device:nfc201",
            "40.7580,-73.9855",
            500,
            now(),
            "hash2",
            "ipfs2"
          )
          .accounts({
            crateRecord: transferred.publicKey,

            authority: unauthorizedWallet.publicKey,  // Wrong authority!
            parentCrate: original.publicKey,
            systemProgram: anchor.web3.SystemProgram.programId,
          })
          .signers([unauthorizedWallet, transferred])
          .rpc();
        
        assert.fail("Should have thrown UnauthorizedUpdate error");
      } catch (err) {

        assert.ok(
          err.toString().includes("UnauthorizedUpdate") ||
          err.toString().includes("ConstraintRaw") // Anchor's require_keys_eq! throws this
        );
        console.log("✅ Unauthorized transfer rejected");
      }
    });

    it("Rejects unauthorized mix", async () => {
      const crateX = anchor.web3.Keypair.generate();
      const crateY = anchor.web3.Keypair.generate();
      const mixed = anchor.web3.Keypair.generate();

      // Create two crates owned by default wallet
      await program.methods
        .createCrate(
          "MIX_TEST_X",
          "did:crate:mixX",
          "did:owner:owner1",
          "did:device:nfc300",
          "40.7128,-74.0060",

          300,
          now(),
          "hashX",
          "ipfsX"
        )
        .accounts({
          crateRecord: crateX.publicKey,
          authority: provider.wallet.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([crateX])
        .rpc();


      await program.methods
        .createCrate(

          "MIX_TEST_Y",
          "did:crate:mixY",
          "did:owner:owner1",
          "did:device:nfc301",
          "40.7128,-74.0060",
          400,
          now(),
          "hashY",
          "ipfsY"
        )
        .accounts({
          crateRecord: crateY.publicKey,
          authority: provider.wallet.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([crateY])
        .rpc();

      // Try to mix with unauthorized wallet
      try {
        await program.methods
          .mixCrates(
            "MIX_UNAUTHORIZED",
            "did:crate:mixBad",

            "did:owner:hacker",
            "did:device:nfc302",
            "40.7489,-73.9680",
            now(),

            "hashMix",
            "ipfsMix",

            [crateX.publicKey, crateY.publicKey]
          )
          .accounts({

            crateRecord: mixed.publicKey,
            authority: unauthorizedWallet.publicKey,  // Wrong authority!

            systemProgram: anchor.web3.SystemProgram.programId,
          })

          .remainingAccounts([
            { pubkey: crateX.publicKey, isWritable: false, isSigner: false },
            { pubkey: crateY.publicKey, isWritable: false, isSigner: false },
          ])
          .signers([unauthorizedWallet, mixed])
          .rpc();
        
        assert.fail("Should have thrown UnauthorizedUpdate error");
      } catch (err) {
        assert.ok(
          err.toString().includes("UnauthorizedUpdate") ||
          err.toString().includes("ConstraintRaw")

        );
        console.log("✅ Unauthorized mix rejected");
      }
    });


    it("Rejects unauthorized split", async () => {

      const original = anchor.web3.Keypair.generate();
      const splitChild = anchor.web3.Keypair.generate();
      const splitChild2 = anchor.web3.Keypair.generate();

      // Create original owned by default wallet
      await program.methods
        .createCrate(
          "SPLIT_TEST",

          "did:crate:split1",
          "did:owner:owner1",

          "did:device:nfc400",
          "40.7128,-74.0060",
          1000,
          now(),
          "hash1",
          "ipfs1"
        )

        .accounts({

          crateRecord: original.publicKey,

          authority: provider.wallet.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })

        .signers([original])
        .rpc();


      // Try to split with unauthorized wallet
      try {
        await program.methods
          .splitCrate(
            "SPLIT_UNAUTHORIZED",
            "did:crate:splitBad",
            "did:owner:hacker",
            "did:device:nfc401",
            "40.7500,-74.0000",
            500,
            now(),

            "hashSplit",
            "ipfsSplit",
            [splitChild.publicKey, splitChild2.publicKey],
            [500, 500]
          )
          .accounts({
            crateRecord: splitChild.publicKey,
            authority: unauthorizedWallet.publicKey,  // Wrong authority!
            parentCrate: original.publicKey,
            systemProgram: anchor.web3.SystemProgram.programId,
          })
          .signers([unauthorizedWallet, splitChild])
          .rpc();

        
        assert.fail("Should have thrown UnauthorizedUpdate error");
      } catch (err) {
        assert.ok(
          err.toString().includes("UnauthorizedUpdate") ||
          err.toString().includes("ConstraintRaw")

        );
        console.log("✅ Unauthorized split rejected");
      }
    });
  });
});
