import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcrypt";
import { User, UserRole } from "../generated/prisma/client";
import {
  InvalidUniversityIdentityError,
  normalizeEmail,
  UniversityIdentityParser,
} from "./domain/university-identity-parser";
import { LoginDto } from "./dto/login.dto";
import { RegisterDto } from "./dto/register.dto";
import { UsersRepository } from "./users.repository";

export type PublicUser = Omit<User, "passwordHash">;

export interface AuthResponse {
  accessToken: string;
  user: PublicUser;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersRepository,
    private readonly identityParser: UniversityIdentityParser,
    private readonly jwt: JwtService,
  ) {}

  async register(dto: RegisterDto): Promise<AuthResponse> {
    let identity;
    try {
      identity = this.identityParser.parse(dto.email);
    } catch (error) {
      if (error instanceof InvalidUniversityIdentityError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }

    if (await this.users.findByEmail(identity.email)) {
      throw new ConflictException("An account already exists for this email");
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);
    const user = await this.users.create({
      name: dto.name.trim(),
      email: identity.email,
      passwordHash,
      role: dto.role,
      batchYear: identity.batchYear,
    });
    return this.createAuthResponse(user);
  }

  async login(dto: LoginDto): Promise<AuthResponse> {
    const user = await this.users.findByEmail(normalizeEmail(dto.email));
    if (!user || !(await bcrypt.compare(dto.password, user.passwordHash))) {
      throw new UnauthorizedException("Invalid email or password");
    }
    return this.createAuthResponse(user);
  }

  private async createAuthResponse(user: User): Promise<AuthResponse> {
    const accessToken = await this.jwt.signAsync({
      sub: user.id,
      email: user.email,
      role: user.role,
      batchYear: user.batchYear,
    });
    const publicUser: PublicUser = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      batchYear: user.batchYear,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
    return { accessToken, user: publicUser };
  }
}

export interface JwtPayload {
  sub: string;
  email: string;
  role: UserRole;
  batchYear: number | null;
  iat?: number;
  exp?: number;
}
