-- Widen content_type CHECK constraint on messages table to allow rich WhatsApp message types
ALTER TABLE wacrm.messages
  DROP CONSTRAINT IF EXISTS messages_content_type_check;

ALTER TABLE wacrm.messages
  ADD CONSTRAINT messages_content_type_check
  CHECK (content_type IN (
    'text', 'image', 'document', 'audio', 'video',
    'location', 'template', 'interactive', 'sticker', 'poll', 'vcard', 'revoked'
  ));
