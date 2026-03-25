# 2026-03-25 Token-Scoped MVP Setup

- documented the MVP decision to treat the API token as the main public setup boundary
- removed explicit integration creation from the blueprint happy path for now
- clarified that the hosted registry should sit behind the authenticated token rather than requiring `integration_id` in the public MVP flow
- kept room in the docs to add explicit setup ids or integration ids later if one account needs several familiar setups
