import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { SupabaseService } from '../common/supabase/supabase.service';

@Injectable()
export class AuthService {
  constructor(
    private supabase: SupabaseService,
    private jwt: JwtService,
  ) {}

  async login(email: string, password: string) {
    const { data, error } = await this.supabase
      .anonClient()
      .auth.signInWithPassword({ email, password });

    if (error || !data.user) {
      throw new UnauthorizedException('Credenciais inválidas');
    }

    // Busca perfil do usuário
    const { data: profile } = await this.supabase.db
      .from('users')
      .select('*')
      .eq('id', data.user.id)
      .single();

    const payload = {
      sub: data.user.id,
      email: data.user.email,
      role: profile?.role || 'operador',
    };

    return {
      access_token: this.jwt.sign(payload),
      user: profile,
    };
  }

  async me(userId: string) {
    const { data } = await this.supabase.db
      .from('users')
      .select('*')
      .eq('id', userId)
      .single();
    return data;
  }
}
