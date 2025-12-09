import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { SignOptions } from 'jsonwebtoken';
import { DatabaseService } from '../database/database.service';
import { UsersService } from '../users/users.service';
import type { User } from '../users/entities/user.entity';
import { RefreshToken, RefreshTokenRow, rowToRefreshToken } from './entities/refresh-token.entity';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

const REFRESH_TOKEN_SALT_ROUNDS = 10;

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly db: DatabaseService,
  ) {}

  private async generateTokens(user: User) {
    const accessExpiresIn: SignOptions['expiresIn'] =
      (this.configService.get<string>('jwt.accessExpiresIn') as SignOptions['expiresIn']) ||
      '15m';
    const refreshExpiresIn: SignOptions['expiresIn'] =
      (this.configService.get<string>('jwt.refreshExpiresIn') as SignOptions['expiresIn']) ||
      '7d';

    const accessToken = await this.jwtService.signAsync(
      { sub: user.id, email: user.email },
      {
        secret: this.configService.get<string>('jwt.accessSecret'),
        expiresIn: accessExpiresIn,
      },
    );

    const refreshToken = await this.jwtService.signAsync(
      { sub: user.id, email: user.email, type: 'refresh' },
      {
        secret: this.configService.get<string>('jwt.refreshSecret'),
        expiresIn: refreshExpiresIn,
      },
    );

    const payload = this.jwtService.decode(refreshToken) as { exp?: number };
    const expiresAt = payload?.exp
      ? new Date(payload.exp * 1000)
      : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await this.storeRefreshToken(user, refreshToken, expiresAt);

    return { accessToken, refreshToken };
  }

  private async storeRefreshToken(
    user: User,
    refreshToken: string,
    expiresAt: Date,
  ) {
    const tokenHash = await bcrypt.hash(refreshToken, REFRESH_TOKEN_SALT_ROUNDS);
    await this.db.sql`
      INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
      VALUES (${user.id}, ${tokenHash}, ${expiresAt})
    `;
  }

  async register(dto: RegisterDto) {
    const existing = await this.usersService.findByEmail(dto.email);
    if (existing) {
      throw new BadRequestException('Email already registered');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const user = await this.usersService.create(dto.email, passwordHash, dto.name);
    const tokens = await this.generateTokens(user);
    return { user: this.sanitizeUser(user), ...tokens };
  }

  async validateUser(email: string, password: string) {
    const user = await this.usersService.findByEmail(email);
    if (!user) return null;

    const passwordValid = await bcrypt.compare(password, user.passwordHash);
    if (!passwordValid) return null;

    return user;
  }

  async login(dto: LoginDto) {
    const user = await this.validateUser(dto.email, dto.password);
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }
    const tokens = await this.generateTokens(user);
    return { user: this.sanitizeUser(user), ...tokens };
  }

  async refreshTokens(refreshToken: string) {
    const payload = await this.verifyRefreshToken(refreshToken);
    const user = await this.usersService.findById(payload.sub);
    if (!user) {
      throw new UnauthorizedException('User not found');
    }
    const tokens = await this.generateTokens(user);
    return { user: this.sanitizeUser(user), ...tokens };
  }

  async logout(refreshToken: string) {
    const payload = await this.verifyRefreshToken(refreshToken);
    await this.revokeRefreshToken(payload.sub, refreshToken);
    return { success: true };
  }

  private async verifyRefreshToken(refreshToken: string) {
    try {
      const payload = await this.jwtService.verifyAsync(refreshToken, {
        secret: this.configService.get<string>('jwt.refreshSecret'),
      });

      if (payload.type !== 'refresh') {
        throw new UnauthorizedException('Invalid refresh token');
      }

      const rows = await this.db.sql<RefreshTokenRow[]>`
        SELECT * FROM refresh_tokens
        WHERE user_id = ${payload.sub} AND revoked_at IS NULL
      `;

      const tokens = rows.map(rowToRefreshToken);
      const match = await this.findMatchingRefreshToken(tokens, refreshToken);
      if (!match) {
        throw new UnauthorizedException('Refresh token revoked');
      }

      if (match.expiresAt < new Date()) {
        throw new UnauthorizedException('Refresh token expired');
      }

      return payload as { sub: string; email: string; type: string };
    } catch (err) {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  private async findMatchingRefreshToken(
    tokens: RefreshToken[],
    token: string,
  ) {
    for (const stored of tokens) {
      const isMatch = await bcrypt.compare(token, stored.tokenHash);
      if (isMatch) {
        return stored;
      }
    }
    return null;
  }

  private async revokeRefreshToken(userId: string, token: string) {
    const rows = await this.db.sql<RefreshTokenRow[]>`
      SELECT * FROM refresh_tokens
      WHERE user_id = ${userId} AND revoked_at IS NULL
    `;

    const tokens = rows.map(rowToRefreshToken);

    for (const stored of tokens) {
      const isMatch = await bcrypt.compare(token, stored.tokenHash);
      if (isMatch) {
        await this.db.sql`
          UPDATE refresh_tokens
          SET revoked_at = ${new Date()}
          WHERE id = ${stored.id}
        `;
        return;
      }
    }
  }

  sanitizeUser(user: User) {
    const { passwordHash, ...rest } = user;
    return rest;
  }
}
