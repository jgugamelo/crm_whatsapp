-- 035_sync_deal_title_on_contact_name_update.sql
-- Sync deal titles when contact names are updated (e.g., when webhook resolves pushName)

CREATE OR REPLACE FUNCTION wacrm.sync_deal_title_on_contact_name_change()
RETURNS TRIGGER AS $$
BEGIN
  -- If the name of the contact changed and is not null/empty
  IF (OLD.name IS DISTINCT FROM NEW.name) AND NEW.name IS NOT NULL AND NEW.name <> '' THEN
    -- Update open deals whose title is equal to the old fallback name, phone, or raw phone
    UPDATE wacrm.deals
    SET title = NEW.name
    WHERE contact_id = NEW.id
      AND status = 'open'
      AND (
        title = OLD.name 
        OR title = NEW.phone 
        OR title = REPLACE(NEW.phone, '+', '')
        -- Also matches if the title was set to a phone number structure
        OR title ~ '^[0-9+ \-]+$'
      );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_sync_deal_title_on_contact_name_change ON wacrm.contacts;
CREATE TRIGGER trigger_sync_deal_title_on_contact_name_change
AFTER UPDATE OF name ON wacrm.contacts
FOR EACH ROW
EXECUTE FUNCTION wacrm.sync_deal_title_on_contact_name_change();

-- Retroactively update existing open deals where title is a number to the contact's current name
UPDATE wacrm.deals d
SET title = c.name
FROM wacrm.contacts c
WHERE d.contact_id = c.id
  AND d.status = 'open'
  AND d.title ~ '^[0-9+ \-]+$'
  AND c.name IS NOT NULL 
  AND c.name <> ''
  AND c.name !~ '^[0-9+ \-]+$';
