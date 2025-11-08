use anchor_lang::prelude::*;

declare_id!("FHzgesT5QzphL5eucFCjL9KL59TLs3jztw7Qe9RZjHta"); 

#[program]
pub mod nautilink {
    use super::*;

    pub fn record_crate(
        ctx: Context<RecordCrate>,
        crate_id: String,
        weight: u32,
        timestamp: i64,
        hash: String,

        ipfs_cid: String,
    ) -> Result<()> {
        let record = &mut ctx.accounts.crate_record;

        record.crate_id = crate_id;

        record.weight = weight;
        record.timestamp = timestamp;
        record.hash = hash;

        record.ipfs_cid = ipfs_cid;

        record.authority = ctx.accounts.authority.key();
        Ok(())
    }
}

#[derive(Accounts)]
#[instruction(crate_id: String)]
pub struct RecordCrate<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + 32 + 4 + 32 + 4 + 8 + 4 + 32 + 4 + 64
    )]
    pub crate_record: Account<'info, CrateRecord>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[account]
pub struct CrateRecord {
    pub authority: Pubkey,
    pub crate_id: String,
    pub weight: u32,
    pub timestamp: i64,
    pub hash: String,
    pub ipfs_cid: String,
}

