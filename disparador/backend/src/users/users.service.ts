import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../common/supabase/supabase.service';

@Injectable()
export class UsersService {
  constructor(private supabase: SupabaseService) {}

  async findAll() {
    const { data } = await this.supabase.db.from('users').select('*').order('nome');
    return data;
  }

  async create(body: { nome: string; email: string; role: string; password: string }) {
    const { data: auth, error } = await this.supabase.anonClient().auth.admin.createUser({
      email: body.email,
      password: body.password,
      email_confirm: true,
    });
    if (error) throw new Error(error.message);

    const { data } = await this.supabase.db
      .from('users')
      .insert({ id: auth.user.id, nome: body.nome, email: body.email, role: body.role })
      .select().single();
    return data;
  }
}
