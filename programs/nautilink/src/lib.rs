use anchor_lang::prelude::*;

declare_id!("FHzgesT5QzphL5eucFCjL9KL59TLs3jztw7Qe9RZjHta");

#[program]
pub mod nautilink {
    use super::*;

    /// Creates the initial crate record (no parents)
    pub fn create_crate(
        ctx: Context<CreateCrate>,
        crate_id: String,
        crate_did: String,
        owner_did: String,
        device_did: String,
        location: String,
        weight: u32,
        timestamp: i64,
        hash: String,
        ipfs_cid: String,
    ) -> Result<()> {
        let record = &mut ctx.accounts.crate_record;
        record.crate_id = crate_id;
        record.crate_did = crate_did;
        record.owner_did = owner_did;
        record.device_did = device_did;
        record.location = location;
        record.weight = weight;
        record.timestamp = timestamp;
        record.hash = hash;
        record.ipfs_cid = ipfs_cid;
        record.authority = ctx.accounts.authority.key();
        record.parent_crates = Vec::new();
        record.child_crates = Vec::new();
        record.parent_weights = Vec::new();
        record.split_distribution = Vec::new();
        record.operation_type = OperationType::Created;
        Ok(())

    }

    /// Transfers ownership without changing weight
    pub fn transfer_ownership(
        ctx: Context<TransferOwnership>,
        crate_id: String,
        crate_did: String,
        owner_did: String,
        device_did: String,
        location: String,
        weight: u32,
        timestamp: i64,

        hash: String,
        ipfs_cid: String,
    ) -> Result<()> {
        let parent = &ctx.accounts.parent_crate;

        require_keys_eq!(
            ctx.accounts.authority.key(),
            parent.authority,
            ErrorCode::UnauthorizedUpdate
        );

        require!(weight == parent.weight, ErrorCode::WeightMismatchOnTransfer);

        let record = &mut ctx.accounts.crate_record;
        record.crate_id = crate_id;
        record.crate_did = crate_did;
        record.owner_did = owner_did;
        record.device_did = device_did;
        record.location = location;
        record.weight = weight;
        record.timestamp = timestamp;
        record.hash = hash;
        record.ipfs_cid = ipfs_cid;
        record.authority = ctx.accounts.authority.key();
        record.parent_crates = vec![parent.key()];
        record.child_crates = Vec::new();
        record.parent_weights = vec![parent.weight];
        record.split_distribution = Vec::new();
        record.operation_type = OperationType::Transferred;

        Ok(())
    }


    /// Mixes multiple parent crates into one
    pub fn mix_crates<'info>(

        ctx: Context<'_, '_, 'info, 'info, MixCrates<'info>>,
        crate_id: String,
        crate_did: String,
        owner_did: String,
        device_did: String,
        location: String,

        timestamp: i64,
        hash: String,
        ipfs_cid: String,
        parent_keys: Vec<Pubkey>,
    ) -> Result<()> {
        require!(parent_keys.len() >= 2, ErrorCode::MixRequiresMultipleParents);

        require!(parent_keys.len() <= CrateRecord::MAX_PARENTS, ErrorCode::TooManyParents);

        let mut total_weight: u32 = 0;
        let mut parent_weights = Vec::new();

        for parent_info in ctx.remaining_accounts.iter() {
            let parent: Account<CrateRecord> = Account::try_from(parent_info)?;
            require_keys_eq!(
                parent.authority,
                ctx.accounts.authority.key(),
                ErrorCode::UnauthorizedUpdate
            );


            total_weight = total_weight
                .checked_add(parent.weight)
                .ok_or(ErrorCode::WeightOverflow)?;
            parent_weights.push(parent.weight);
        }

        let record = &mut ctx.accounts.crate_record;
        record.crate_id = crate_id;
        record.crate_did = crate_did;
        record.owner_did = owner_did;
        record.device_did = device_did;
        record.location = location;
        record.weight = total_weight;
        record.timestamp = timestamp;
        record.hash = hash;

        record.ipfs_cid = ipfs_cid;

        record.authority = ctx.accounts.authority.key();
        record.parent_crates = parent_keys;
        record.child_crates = Vec::new();
        record.parent_weights = parent_weights;
        record.split_distribution = Vec::new();
        record.operation_type = OperationType::Mixed;

        Ok(())
    }

    /// Splits one crate into multiple child crates
    pub fn split_crate(
        ctx: Context<SplitCrate>,
        crate_id: String,
        crate_did: String,
        owner_did: String,
        device_did: String,
        location: String,
        weight: u32,
        timestamp: i64,
        hash: String,
        ipfs_cid: String,
        child_keys: Vec<Pubkey>,
        child_weights: Vec<u32>,
    ) -> Result<()> {
        let parent = &ctx.accounts.parent_crate;

        require_keys_eq!(
            ctx.accounts.authority.key(),
            parent.authority,
            ErrorCode::UnauthorizedUpdate
        );

        require!(child_keys.len() >= 2, ErrorCode::SplitRequiresMultipleChildren);
        require!(child_keys.len() <= CrateRecord::MAX_CHILDREN, ErrorCode::TooManyChildren);

        require!(
            child_keys.len() == child_weights.len(),
            ErrorCode::ChildKeyWeightMismatch
        );

        let total_child_weight: u32 = child_weights.iter().sum();

        require!(total_child_weight == parent.weight, ErrorCode::SplitWeightMismatch);


        let record = &mut ctx.accounts.crate_record;
        record.crate_id = crate_id;
        record.crate_did = crate_did;
        record.owner_did = owner_did;
        record.device_did = device_did;
        record.location = location;
        record.weight = weight;
        record.timestamp = timestamp;
        record.hash = hash;
        record.ipfs_cid = ipfs_cid;
        record.authority = ctx.accounts.authority.key();
        record.parent_crates = vec![parent.key()];
        record.child_crates = child_keys.clone();
        record.parent_weights = vec![parent.weight];
        record.split_distribution = child_weights;
        record.operation_type = OperationType::Split;

        Ok(())
    }

    pub fn update_parent_children(
        ctx: Context<UpdateParent>,
        child_keys: Vec<Pubkey>,
    ) -> Result<()> {
        let parent = &mut ctx.accounts.parent_crate;
        require_keys_eq!(ctx.accounts.authority.key(), parent.authority, ErrorCode::UnauthorizedUpdate);
        parent.child_crates = child_keys;
        Ok(())
    }

    pub fn update_child_parent(
        ctx: Context<UpdateChild>,
        parent_key: Pubkey,
    ) -> Result<()> {
        let child = &mut ctx.accounts.child_crate;
        require_keys_eq!(ctx.accounts.authority.key(), child.authority, ErrorCode::UnauthorizedUpdate);
        if !child.parent_crates.contains(&parent_key) {
            child.parent_crates.push(parent_key);
        }
        Ok(())
    }
}

// ===================
// CONTEXTS
// ===================

#[derive(Accounts)]
#[instruction(crate_id: String)]
pub struct CreateCrate<'info> {
    #[account(init, payer = authority, space = 8 + CrateRecord::MAX_SIZE)]
    pub crate_record: Account<'info, CrateRecord>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(crate_id: String)]
pub struct TransferOwnership<'info> {
    #[account(init, payer = authority, space = 8 + CrateRecord::MAX_SIZE)]
    pub crate_record: Account<'info, CrateRecord>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub parent_crate: Account<'info, CrateRecord>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(crate_id: String)]
pub struct MixCrates<'info> {
    #[account(init, payer = authority, space = 8 + CrateRecord::MAX_SIZE)]
    pub crate_record: Account<'info, CrateRecord>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(crate_id: String)]
pub struct SplitCrate<'info> {
    #[account(init, payer = authority, space = 8 + CrateRecord::MAX_SIZE)]
    pub crate_record: Account<'info, CrateRecord>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub parent_crate: Account<'info, CrateRecord>,
    pub system_program: Program<'info, System>,
}


#[derive(Accounts)]
pub struct UpdateParent<'info> {
    #[account(mut)]
    pub parent_crate: Account<'info, CrateRecord>,
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct UpdateChild<'info> {
    #[account(mut)]
    pub child_crate: Account<'info, CrateRecord>,
    pub authority: Signer<'info>,
}

// ===================
// DATA STRUCTURE
// ===================

#[account]

pub struct CrateRecord {
    pub authority: Pubkey,
    pub crate_id: String,
    pub crate_did: String,  // DID for crate
    pub owner_did: String,  // DID for owner
    pub device_did: String, // DID for NFC or scanner device
    pub location: String,   // Location string (lat,long)
    pub weight: u32,
    pub timestamp: i64,
    pub hash: String,
    pub ipfs_cid: String,

    pub parent_crates: Vec<Pubkey>,
    pub child_crates: Vec<Pubkey>,
    pub parent_weights: Vec<u32>,
    pub split_distribution: Vec<u32>,
    pub operation_type: OperationType,

}

impl CrateRecord {

    pub const MAX_PARENTS: usize = 10;
    pub const MAX_CHILDREN: usize = 10;
    pub const MAX_SIZE: usize =
        32 + // authority
        4 + 64 + // crate_id
        4 + 64 + // crate_did
        4 + 64 + // owner_did
        4 + 64 + // device_did
        4 + 64 + // location
        4 + 8 +  // weight + timestamp
        4 + 64 + // hash
        4 + 64 + // ipfs_cid
        4 + (Self::MAX_PARENTS * 32) +
        4 + (Self::MAX_CHILDREN * 32) +
        4 + (Self::MAX_PARENTS * 4) +
        4 + (Self::MAX_CHILDREN * 4) +
        1;
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq)]
pub enum OperationType {
    Created,
    Transferred,
    Mixed,
    Split,
}

// ===================
// ERRORS
// ===================


#[error_code]
pub enum ErrorCode {
    #[msg("Weight must remain the same during transfer")]
    WeightMismatchOnTransfer,
    #[msg("Mix requires at least 2 parents")]

    MixRequiresMultipleParents,
    #[msg("Split requires at least 2 children")]
    SplitRequiresMultipleChildren,

    #[msg("Too many parents (max 10)")]
    TooManyParents,
    #[msg("Too many children (max 10)")]
    TooManyChildren,

    #[msg("Child key/weight mismatch")]
    ChildKeyWeightMismatch,
    #[msg("Split weights do not sum to parent weight")]
    SplitWeightMismatch,

    #[msg("Weight overflow")]
    WeightOverflow,
    #[msg("Unauthorized update attempt")]
    UnauthorizedUpdate,
}

