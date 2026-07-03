const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://rpjyrsjozybeerwkndcc.supabase.co';
const serviceRoleKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJwanlyc2pvenliZWVyd2tuZGNjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NzAzODY3NiwiZXhwIjoyMDkyNjE0Njc2fQ.nhb-ttlTOzq0L45ao8C0_mqThdRhqjvRWc4l21tsTiI';

async function check() {
  const options = {
    db: {
      schema: 'wacrm'
    }
  };
  const supabaseService = createClient(supabaseUrl, serviceRoleKey, options);

  console.log('--- Checking All Messages for Audio / Media file indicators ---');
  const { data: messages, error } = await supabaseService
    .from('messages')
    .select('id, content_type, content_text, media_url, sender_type, message_id, created_at')
    .or('content_type.eq.audio,media_url.like.%.ogg,media_url.like.%.mp3,media_url.like.%.m4a,media_url.like.%.opus')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching messages:', error);
  } else {
    console.log(`Found ${messages?.length || 0} potential audio messages.`);
    console.log(JSON.stringify(messages, null, 2));
  }
}

check();
