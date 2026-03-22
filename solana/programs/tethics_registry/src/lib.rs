use anchor_lang::{prelude::*, Discriminator};

declare_id!("BfyK1qYw59CPATaM4db7j9CLeaaJBbhsQTKfGtVdtpne");

#[program]
pub mod tethics_registry {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>, root_authority: Pubkey) -> Result<()> {
        require!(root_authority != Pubkey::default(), RegistryError::InvalidRootAuthority);
        let config = &mut ctx.accounts.config;
        config.version = 1;
        config.root_authority = root_authority;
        config.paused = false;
        config.created_at = Clock::get()?.unix_timestamp;
        config.updated_at = config.created_at;
        Ok(())
    }

    pub fn rotate_root_authority(
        ctx: Context<RotateRootAuthority>,
        new_root_authority: Pubkey,
    ) -> Result<()> {
        require!(new_root_authority != Pubkey::default(), RegistryError::InvalidRootAuthority);
        assert_root_authority(&ctx.accounts.config, &ctx.accounts.authority)?;

        let config = &mut ctx.accounts.config;
        config.root_authority = new_root_authority;
        config.updated_at = Clock::get()?.unix_timestamp;
        Ok(())
    }

    pub fn set_pause(ctx: Context<SetPause>, paused: bool) -> Result<()> {
        assert_root_authority(&ctx.accounts.config, &ctx.accounts.authority)?;

        let config = &mut ctx.accounts.config;
        config.paused = paused;
        config.updated_at = Clock::get()?.unix_timestamp;
        Ok(())
    }

    pub fn add_approver(ctx: Context<AddApprover>) -> Result<()> {
        assert_root_authority(&ctx.accounts.config, &ctx.accounts.authority)?;

        let approver = &mut ctx.accounts.approver_role;
        let now = Clock::get()?.unix_timestamp;
        approver.approver = ctx.accounts.approver.key();
        approver.active = true;
        approver.delegated_by = ctx.accounts.authority.key();
        if approver.created_at == 0 {
            approver.created_at = now;
        }
        approver.updated_at = now;

        ctx.accounts.config.updated_at = now;
        Ok(())
    }

    pub fn remove_approver(ctx: Context<RemoveApprover>) -> Result<()> {
        assert_root_authority(&ctx.accounts.config, &ctx.accounts.authority)?;

        let approver = &mut ctx.accounts.approver_role;
        require!(approver.approver == ctx.accounts.approver.key(), RegistryError::InvalidApprover);
        approver.active = false;
        approver.updated_at = Clock::get()?.unix_timestamp;

        ctx.accounts.config.updated_at = approver.updated_at;
        Ok(())
    }

    pub fn submit_project_proposal(
        ctx: Context<SubmitProjectProposal>,
        slug: String,
        display_name: String,
        metadata_hash: [u8; 32],
        metadata_uri: String,
    ) -> Result<()> {
        assert_not_paused(&ctx.accounts.config)?;
        validate_slug(&slug)?;
        validate_display_name(&display_name)?;
        validate_hash(&metadata_hash)?;
        validate_uri(&metadata_uri)?;

        let proposal = &mut ctx.accounts.proposal;
        proposal.slug = slug;
        proposal.display_name = display_name;
        proposal.submitted_by = ctx.accounts.proposer.key();
        proposal.metadata_hash = metadata_hash;
        proposal.metadata_uri = metadata_uri;
        proposal.status = ProposalStatus::Pending;
        proposal.submitted_at = Clock::get()?.unix_timestamp;
        proposal.reviewed_by = Pubkey::default();
        proposal.reviewed_at = 0;
        proposal.resolution_hash = [0u8; 32];
        proposal.resolution_uri = String::new();
        Ok(())
    }

    pub fn approve_project_proposal(
        ctx: Context<ApproveProjectProposal>,
        resolution_hash: [u8; 32],
        resolution_uri: String,
    ) -> Result<()> {
        assert_not_paused(&ctx.accounts.config)?;
        assert_can_review(
            &ctx.accounts.config,
            &ctx.accounts.authority,
            Some(&ctx.accounts.approver_role),
        )?;
        validate_hash(&resolution_hash)?;
        validate_uri(&resolution_uri)?;

        let now = Clock::get()?.unix_timestamp;
        let proposal = &mut ctx.accounts.proposal;
        require!(proposal.status == ProposalStatus::Pending, RegistryError::ProposalNotPending);

        proposal.status = ProposalStatus::Approved;
        proposal.reviewed_by = ctx.accounts.authority.key();
        proposal.reviewed_at = now;
        proposal.resolution_hash = resolution_hash;
        proposal.resolution_uri = resolution_uri.clone();

        let project = &mut ctx.accounts.project;
        project.slug = proposal.slug.clone();
        project.display_name = proposal.display_name.clone();
        project.status = ProjectStatus::Approved;
        project.primary_founder_wallet = proposal.submitted_by;
        project.metadata_hash = proposal.metadata_hash;
        project.metadata_uri = proposal.metadata_uri.clone();
        if project.created_at == 0 {
            project.created_at = now;
        }
        project.updated_at = now;
        project.approved_at = now;
        project.approved_by = ctx.accounts.authority.key();

        Ok(())
    }

    pub fn reject_project_proposal(
        ctx: Context<RejectProjectProposal>,
        resolution_hash: [u8; 32],
        resolution_uri: String,
    ) -> Result<()> {
        assert_not_paused(&ctx.accounts.config)?;
        assert_can_review(
            &ctx.accounts.config,
            &ctx.accounts.authority,
            Some(&ctx.accounts.approver_role),
        )?;
        validate_hash(&resolution_hash)?;
        validate_uri(&resolution_uri)?;

        let proposal = &mut ctx.accounts.proposal;
        require!(proposal.status == ProposalStatus::Pending, RegistryError::ProposalNotPending);

        proposal.status = ProposalStatus::Rejected;
        proposal.reviewed_by = ctx.accounts.authority.key();
        proposal.reviewed_at = Clock::get()?.unix_timestamp;
        proposal.resolution_hash = resolution_hash;
        proposal.resolution_uri = resolution_uri;

        Ok(())
    }

    pub fn authorize_asset(
        ctx: Context<CreateAssetRecord>,
        asset_type: String,
        asset_id: String,
        metadata_hash: [u8; 32],
        metadata_uri: String,
    ) -> Result<()> {
        create_asset_record(
            ctx,
            asset_type,
            asset_id,
            metadata_hash,
            metadata_uri,
            AssetRecordStatus::Authorized,
        )
    }

    pub fn mark_unwanted_asset(
        ctx: Context<CreateAssetRecord>,
        asset_type: String,
        asset_id: String,
        metadata_hash: [u8; 32],
        metadata_uri: String,
    ) -> Result<()> {
        create_asset_record(
            ctx,
            asset_type,
            asset_id,
            metadata_hash,
            metadata_uri,
            AssetRecordStatus::Unwanted,
        )
    }

    pub fn revoke_asset(
        ctx: Context<RevokeAssetRecord>,
        _asset_type: String,
        _asset_id: String,
        metadata_hash: [u8; 32],
        metadata_uri: String,
    ) -> Result<()> {
        revoke_asset_record(
            ctx,
            metadata_hash,
            metadata_uri,
        )
    }
}

fn create_asset_record(
    ctx: Context<CreateAssetRecord>,
    asset_type: String,
    asset_id: String,
    metadata_hash: [u8; 32],
    metadata_uri: String,
    status: AssetRecordStatus,
) -> Result<()> {
    assert_not_paused(&ctx.accounts.config)?;
    assert_can_review(
        &ctx.accounts.config,
        &ctx.accounts.authority,
        Some(&ctx.accounts.approver_role),
    )?;
    require!(
        ctx.accounts.project.status == ProjectStatus::Approved,
        RegistryError::ProjectNotApproved
    );
    validate_asset_type(&asset_type)?;
    validate_asset_id(&asset_id)?;
    validate_hash(&metadata_hash)?;
    validate_uri(&metadata_uri)?;

    let asset = &mut ctx.accounts.asset;
    let now = Clock::get()?.unix_timestamp;
    asset.slug = ctx.accounts.project.slug.clone();
    asset.asset_type = asset_type;
    asset.asset_id = asset_id;
    asset.status = status;
    asset.metadata_hash = metadata_hash;
    asset.metadata_uri = metadata_uri;
    asset.actor = ctx.accounts.authority.key();
    if asset.created_at == 0 {
        asset.created_at = now;
    }
    asset.updated_at = now;

    Ok(())
}

fn revoke_asset_record(
    ctx: Context<RevokeAssetRecord>,
    metadata_hash: [u8; 32],
    metadata_uri: String,
) -> Result<()> {
    assert_not_paused(&ctx.accounts.config)?;
    assert_can_review(
        &ctx.accounts.config,
        &ctx.accounts.authority,
        Some(&ctx.accounts.approver_role),
    )?;
    require!(
        ctx.accounts.project.status == ProjectStatus::Approved,
        RegistryError::ProjectNotApproved
    );
    validate_hash(&metadata_hash)?;
    validate_uri(&metadata_uri)?;

    let asset = &mut ctx.accounts.asset;
    asset.status = AssetRecordStatus::Revoked;
    asset.metadata_hash = metadata_hash;
    asset.metadata_uri = metadata_uri;
    asset.actor = ctx.accounts.authority.key();
    asset.updated_at = Clock::get()?.unix_timestamp;
    Ok(())
}

fn assert_root_authority(config: &Account<GlobalConfig>, authority: &Signer) -> Result<()> {
    require!(
        config.root_authority == authority.key(),
        RegistryError::NotRootAuthority
    );
    Ok(())
}

fn assert_not_paused(config: &Account<GlobalConfig>) -> Result<()> {
    require!(!config.paused, RegistryError::ProgramPaused);
    Ok(())
}

const MAX_SLUG_LEN: usize = 64;
const MAX_DISPLAY_NAME_LEN: usize = 128;
const MAX_URI_LEN: usize = 256;
const MAX_ASSET_TYPE_LEN: usize = 32;
const MAX_ASSET_ID_LEN: usize = 128;

fn validate_slug(value: &str) -> Result<()> {
    require!(!value.trim().is_empty(), RegistryError::InvalidSlug);
    require!(value.len() <= MAX_SLUG_LEN, RegistryError::SlugTooLong);
    Ok(())
}

fn validate_display_name(value: &str) -> Result<()> {
    require!(!value.trim().is_empty(), RegistryError::InvalidDisplayName);
    require!(value.len() <= MAX_DISPLAY_NAME_LEN, RegistryError::DisplayNameTooLong);
    Ok(())
}

fn validate_uri(value: &str) -> Result<()> {
    require!(!value.trim().is_empty(), RegistryError::MissingMetadataUri);
    require!(value.len() <= MAX_URI_LEN, RegistryError::MetadataUriTooLong);
    Ok(())
}

fn validate_hash(value: &[u8; 32]) -> Result<()> {
    require!(*value != [0u8; 32], RegistryError::MissingMetadataHash);
    Ok(())
}

fn validate_asset_type(value: &str) -> Result<()> {
    require!(!value.trim().is_empty(), RegistryError::InvalidAssetType);
    require!(value.len() <= MAX_ASSET_TYPE_LEN, RegistryError::AssetTypeTooLong);
    Ok(())
}

fn validate_asset_id(value: &str) -> Result<()> {
    require!(!value.trim().is_empty(), RegistryError::InvalidAssetId);
    require!(value.len() <= MAX_ASSET_ID_LEN, RegistryError::AssetIdTooLong);
    Ok(())
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(init, payer = payer, space = 8 + GlobalConfig::MAX_SIZE, seeds = [b"config"], bump)]
    pub config: Account<'info, GlobalConfig>,
    #[account(mut)]
    pub payer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RotateRootAuthority<'info> {
    #[account(mut, seeds = [b"config"], bump)]
    pub config: Account<'info, GlobalConfig>,
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct SetPause<'info> {
    #[account(mut, seeds = [b"config"], bump)]
    pub config: Account<'info, GlobalConfig>,
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct AddApprover<'info> {
    #[account(mut, seeds = [b"config"], bump)]
    pub config: Account<'info, GlobalConfig>,
    #[account(
        init_if_needed,
        payer = authority,
        space = 8 + ApproverRole::MAX_SIZE,
        seeds = [b"approver", approver.key().as_ref()],
        bump
    )]
    pub approver_role: Account<'info, ApproverRole>,
    /// CHECK: Used only as a PDA seed / stored key for the delegated approver.
    pub approver: UncheckedAccount<'info>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RemoveApprover<'info> {
    #[account(mut, seeds = [b"config"], bump)]
    pub config: Account<'info, GlobalConfig>,
    #[account(mut, seeds = [b"approver", approver.key().as_ref()], bump)]
    pub approver_role: Account<'info, ApproverRole>,
    /// CHECK: Used only as a PDA seed / stored key for the delegated approver.
    pub approver: UncheckedAccount<'info>,
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
#[instruction(slug: String, _display_name: String, _metadata_hash: [u8; 32], _metadata_uri: String)]
pub struct SubmitProjectProposal<'info> {
    #[account(seeds = [b"config"], bump)]
    pub config: Account<'info, GlobalConfig>,
    #[account(
        init,
        payer = proposer,
        space = 8 + ProjectProposal::MAX_SIZE,
        seeds = [b"proposal", proposer.key().as_ref(), slug.as_bytes()],
        bump
    )]
    pub proposal: Account<'info, ProjectProposal>,
    #[account(mut)]
    pub proposer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ApproveProjectProposal<'info> {
    #[account(seeds = [b"config"], bump)]
    pub config: Account<'info, GlobalConfig>,
    #[account(
        mut,
        seeds = [b"proposal", proposal.submitted_by.as_ref(), proposal.slug.as_bytes()],
        bump
    )]
    pub proposal: Account<'info, ProjectProposal>,
    #[account(
        init,
        payer = authority,
        space = 8 + ProjectAccount::MAX_SIZE,
        seeds = [b"project", proposal.slug.as_bytes()],
        bump
    )]
    pub project: Account<'info, ProjectAccount>,
    /// CHECK: Optional PDA that proves delegated approver permissions for the signer.
    pub approver_role: UncheckedAccount<'info>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RejectProjectProposal<'info> {
    #[account(seeds = [b"config"], bump)]
    pub config: Account<'info, GlobalConfig>,
    #[account(
        mut,
        seeds = [b"proposal", proposal.submitted_by.as_ref(), proposal.slug.as_bytes()],
        bump
    )]
    pub proposal: Account<'info, ProjectProposal>,
    /// CHECK: Optional PDA that proves delegated approver permissions for the signer.
    pub approver_role: UncheckedAccount<'info>,
    #[account(mut)]
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
#[instruction(asset_type: String, asset_id: String, _metadata_hash: [u8; 32], _metadata_uri: String)]
pub struct CreateAssetRecord<'info> {
    #[account(seeds = [b"config"], bump)]
    pub config: Account<'info, GlobalConfig>,
    #[account(
        mut,
        seeds = [b"project", project.slug.as_bytes()],
        bump
    )]
    pub project: Account<'info, ProjectAccount>,
    #[account(
        init_if_needed,
        payer = authority,
        space = 8 + AssetRecord::MAX_SIZE,
        seeds = [b"asset", project.slug.as_bytes(), asset_type.as_bytes(), asset_id.as_bytes()],
        bump
    )]
    pub asset: Account<'info, AssetRecord>,
    /// CHECK: Optional PDA that proves delegated approver permissions for the signer.
    pub approver_role: UncheckedAccount<'info>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(asset_type: String, asset_id: String, _metadata_hash: [u8; 32], _metadata_uri: String)]
pub struct RevokeAssetRecord<'info> {
    #[account(seeds = [b"config"], bump)]
    pub config: Account<'info, GlobalConfig>,
    #[account(
        mut,
        seeds = [b"project", project.slug.as_bytes()],
        bump
    )]
    pub project: Account<'info, ProjectAccount>,
    #[account(
        mut,
        seeds = [b"asset", project.slug.as_bytes(), asset_type.as_bytes(), asset_id.as_bytes()],
        bump
    )]
    pub asset: Account<'info, AssetRecord>,
    /// CHECK: Optional PDA that proves delegated approver permissions for the signer.
    pub approver_role: UncheckedAccount<'info>,
    #[account(mut)]
    pub authority: Signer<'info>,
}

#[account]
pub struct GlobalConfig {
    pub version: u8,
    pub root_authority: Pubkey,
    pub paused: bool,
    pub created_at: i64,
    pub updated_at: i64,
}

impl GlobalConfig {
    pub const MAX_SIZE: usize = 1 + 32 + 1 + 8 + 8;
}

#[account]
pub struct ApproverRole {
    pub approver: Pubkey,
    pub active: bool,
    pub delegated_by: Pubkey,
    pub created_at: i64,
    pub updated_at: i64,
}

impl ApproverRole {
    pub const MAX_SIZE: usize = 32 + 1 + 32 + 8 + 8;
}

#[account]
pub struct ProjectProposal {
    pub slug: String,
    pub display_name: String,
    pub submitted_by: Pubkey,
    pub metadata_hash: [u8; 32],
    pub metadata_uri: String,
    pub status: ProposalStatus,
    pub submitted_at: i64,
    pub reviewed_by: Pubkey,
    pub reviewed_at: i64,
    pub resolution_hash: [u8; 32],
    pub resolution_uri: String,
}

impl ProjectProposal {
    pub const MAX_SIZE: usize = 4 + 64 + 4 + 128 + 32 + 32 + 4 + 256 + 1 + 8 + 32 + 8 + 32 + 4 + 256;
}

#[account]
pub struct ProjectAccount {
    pub slug: String,
    pub display_name: String,
    pub status: ProjectStatus,
    pub primary_founder_wallet: Pubkey,
    pub metadata_hash: [u8; 32],
    pub metadata_uri: String,
    pub created_at: i64,
    pub updated_at: i64,
    pub approved_at: i64,
    pub approved_by: Pubkey,
}

impl ProjectAccount {
    pub const MAX_SIZE: usize = 4 + 64 + 4 + 128 + 1 + 32 + 32 + 4 + 256 + 8 + 8 + 8 + 32;
}

#[account]
pub struct AssetRecord {
    pub slug: String,
    pub asset_type: String,
    pub asset_id: String,
    pub status: AssetRecordStatus,
    pub metadata_hash: [u8; 32],
    pub metadata_uri: String,
    pub actor: Pubkey,
    pub created_at: i64,
    pub updated_at: i64,
}

impl AssetRecord {
    pub const MAX_SIZE: usize = 4 + 64 + 4 + 32 + 4 + 128 + 1 + 32 + 4 + 256 + 32 + 8 + 8;
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq)]
pub enum ProposalStatus {
    Pending,
    Approved,
    Rejected,
    Cancelled,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq)]
pub enum ProjectStatus {
    PendingReview,
    Approved,
    Rejected,
    Suspended,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq)]
pub enum AssetRecordStatus {
    Authorized,
    Unwanted,
    Revoked,
}

#[error_code]
pub enum RegistryError {
    #[msg("The configured root authority is invalid.")]
    InvalidRootAuthority,
    #[msg("Only the root authority may perform this action.")]
    NotRootAuthority,
    #[msg("Only the root authority or an active delegated approver may perform this action.")]
    NotAuthorizedReviewer,
    #[msg("The program is paused.")]
    ProgramPaused,
    #[msg("The delegated approver account is invalid.")]
    InvalidApprover,
    #[msg("The proposal slug is invalid.")]
    InvalidSlug,
    #[msg("The proposal slug is too long.")]
    SlugTooLong,
    #[msg("The display name is invalid.")]
    InvalidDisplayName,
    #[msg("The display name is too long.")]
    DisplayNameTooLong,
    #[msg("The metadata hash is missing.")]
    MissingMetadataHash,
    #[msg("The metadata URI is missing.")]
    MissingMetadataUri,
    #[msg("The metadata URI is too long.")]
    MetadataUriTooLong,
    #[msg("The proposal is not pending.")]
    ProposalNotPending,
    #[msg("The project is not approved.")]
    ProjectNotApproved,
    #[msg("The asset type is invalid.")]
    InvalidAssetType,
    #[msg("The asset type is too long.")]
    AssetTypeTooLong,
    #[msg("The asset id is invalid.")]
    InvalidAssetId,
    #[msg("The asset id is too long.")]
    AssetIdTooLong,
}

fn assert_can_review(
    config: &Account<GlobalConfig>,
    authority: &Signer,
    approver_role: Option<&UncheckedAccount>,
) -> Result<()> {
    if config.root_authority == authority.key() {
        return Ok(());
    }

    let approver_role = approver_role.ok_or(RegistryError::NotAuthorizedReviewer)?;
    require!(
        approver_role.owner == &crate::ID,
        RegistryError::NotAuthorizedReviewer
    );

    let data = approver_role.try_borrow_data()?;
    require!(data.len() >= 8, RegistryError::NotAuthorizedReviewer);
    let expected = ApproverRole::DISCRIMINATOR;
    require!(data[..8] == expected, RegistryError::NotAuthorizedReviewer);

    let mut slice: &[u8] = &data[8..];
    let decoded = ApproverRole::try_deserialize(&mut slice)
        .map_err(|_| error!(RegistryError::NotAuthorizedReviewer))?;
    require!(decoded.approver == authority.key(), RegistryError::NotAuthorizedReviewer);
    require!(decoded.active, RegistryError::NotAuthorizedReviewer);

    Ok(())
}
