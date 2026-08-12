/*
  Optional database uniqueness safeguard for Buyer duplicates (TC-06).
  Application-level validation already blocks exact duplicates (normalized name + mobile).

  Review data before applying: existing near-duplicates with different formatting may block the index create.

  SQL Server:
*/

-- Digits-only phone helper for indexing (persisted computed column alternative):
-- Prefer cleaning existing Phone values first, then create a unique filtered index.

IF COL_LENGTH('dbo.Buyer', 'Active') IS NOT NULL
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM sys.indexes
        WHERE name = 'UX_Buyer_Company_Name_Phone'
          AND object_id = OBJECT_ID('dbo.Buyer')
    )
    BEGIN
        /*
          This index uses raw Name/Phone. It helps when the UI/API always store trimmed values.
          It will NOT catch duplicates that only differ by case/spaces/punctuation until those rows are normalized.
        */
        CREATE UNIQUE NONCLUSTERED INDEX UX_Buyer_Company_Name_Phone
        ON dbo.Buyer (CompanyId, Name, Phone)
        WHERE Active = 1 AND Name IS NOT NULL AND Phone IS NOT NULL AND LTRIM(RTRIM(Phone)) <> '';
    END
END
GO
