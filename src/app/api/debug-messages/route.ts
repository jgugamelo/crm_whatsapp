import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET() {
  try {
    const supabase = await createClient();

    // Check auth to make sure not anyone can read it, or just allow it for temporary debugging
    const { data: messages, error } = await supabase
      .from('messages')
      .select('id, conversation_id, content_type, content_text, media_url, sender_type, message_id, created_at')
      .order('created_at', { ascending: false })
      .limit(30);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ messages });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
