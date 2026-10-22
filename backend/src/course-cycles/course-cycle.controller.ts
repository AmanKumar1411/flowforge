import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { UserRole } from "../generated/prisma/client";
import { JwtPayload } from "../auth/auth.service";
import {
  JwtAuthGuard,
  AuthenticatedRequest,
} from "../auth/guards/jwt-auth.guard";
import { Roles } from "../auth/guards/roles.decorator";
import { RolesGuard } from "../auth/guards/roles.guard";
import { CourseCycleService } from "./course-cycle.service";
import { CreateCycleDto } from "./dto/create-cycle.dto";
import { CycleResponseDto } from "./dto/cycle-response.dto";
import { UpdateCycleDto } from "./dto/update-cycle.dto";

const currentUser = (request: AuthenticatedRequest): JwtPayload =>
  request.user as JwtPayload;

@Controller("course-cycles")
@UseGuards(JwtAuthGuard, RolesGuard)
export class CourseCycleController {
  constructor(private readonly cycles: CourseCycleService) {}

  @Post()
  @Roles(UserRole.FACULTY)
  create(
    @Req() request: AuthenticatedRequest,
    @Body() dto: CreateCycleDto,
  ): Promise<CycleResponseDto> {
    return this.run(() => this.cycles.create(currentUser(request), dto));
  }

  @Get()
  @Roles(UserRole.STUDENT)
  list(@Req() request: AuthenticatedRequest): Promise<CycleResponseDto[]> {
    return this.run(() => this.cycles.listForStudent(currentUser(request)));
  }

  @Get("my")
  @Roles(UserRole.FACULTY)
  listMine(@Req() request: AuthenticatedRequest): Promise<CycleResponseDto[]> {
    return this.run(() => this.cycles.listMine(currentUser(request)));
  }

  @Get(":id")
  findById(
    @Req() request: AuthenticatedRequest,
    @Param("id", new ParseUUIDPipe()) id: string,
  ): Promise<CycleResponseDto> {
    return this.run(() => this.cycles.findById(currentUser(request), id));
  }

  @Patch(":id")
  @Roles(UserRole.FACULTY)
  update(
    @Req() request: AuthenticatedRequest,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateCycleDto,
  ): Promise<CycleResponseDto> {
    return this.run(() => this.cycles.update(currentUser(request), id, dto));
  }

  @Post(":id/publish")
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.FACULTY)
  publish(
    @Req() request: AuthenticatedRequest,
    @Param("id", new ParseUUIDPipe()) id: string,
  ): Promise<CycleResponseDto> {
    return this.run(() => this.cycles.publish(currentUser(request), id));
  }

  @Post(":id/close")
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.FACULTY)
  close(
    @Req() request: AuthenticatedRequest,
    @Param("id", new ParseUUIDPipe()) id: string,
  ): Promise<CycleResponseDto> {
    return this.run(() => this.cycles.close(currentUser(request), id));
  }

  private async run<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      throw CourseCycleService.toHttpException(error);
    }
  }
}
