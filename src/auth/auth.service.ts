import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { Repository, IsNull } from 'typeorm';
import { UsersService } from '../users/users.service';
import { User } from '../users/entities/user.entity';
import { RefreshToken } from './entities/refresh-token.entity';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

const REFRESH_TOKEN_SALT_ROUNDS = 10;

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    @InjectRepository(RefreshToken)
    private readonly refreshTokenRepository: Repository<RefreshToken>,
  ) {}

  private async generateTokens(user: User) {
    const accessToken = await this.jwtService.signAsync(
      { sub: user.id, email: user.email },
      {
        secret: this.configService.get<string>('jwt.accessSecret'),
        expiresIn: this.configService.get<string>('jwt.accessExpiresIn') || '15m',
      },
    );

    const refreshToken = await this.jwtService.signAsync(
      { sub: user.id, email: user.email, type: 'refresh' },
      {
        secret: this.configService.get<string>('jwt.refreshSecret'),
        expiresIn:
          this.configService.get<string>('jwt.refreshExpiresIn') || '7d',
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
    const entity = this.refreshTokenRepository.create({
      user,
      tokenHash,
      expiresAt,
    });
    await this.refreshTokenRepository.save(entity);
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

      const stored = await this.refreshTokenRepository.find({
        where: {
          user: { id: payload.sub },
          revokedAt: IsNull(),
        },
        relations: ['user'],
      });

      const match = await this.findMatchingRefreshToken(stored, refreshToken);
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
    const tokens = await this.refreshTokenRepository.find({
      where: { user: { id: userId }, revokedAt: IsNull() },
      relations: ['user'],
    });

    for (const stored of tokens) {
      const isMatch = await bcrypt.compare(token, stored.tokenHash);
      if (isMatch) {
        stored.revokedAt = new Date();
        await this.refreshTokenRepository.save(stored);
        return;
      }
    }
  }

  sanitizeUser(user: User) {
    const { passwordHash, refreshTokens, ...rest } = user as any;
    return rest;
  }
}
