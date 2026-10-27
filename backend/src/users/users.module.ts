import { Module } from "@nestjs/common";
import { UsersRepository } from "./domain/users.repository";
import { PrismaUsersRepository } from "./infrastructure/prisma-users.repository";
import { UsersService } from "./users.service";

@Module({
  providers: [
    UsersService,
    { provide: UsersRepository, useClass: PrismaUsersRepository },
  ],
  exports: [UsersService],
})
export class UsersModule {}
