import { Controller, Get } from "@nestjs/common";
import {
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
} from "@nestjs/swagger";
import { Public } from "../../auth/presentation/decorators/public.decorator";
import { HealthReport, HealthService } from "../application/health.service";

@ApiTags("health")
@Controller("health")
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get()
  @Public()
  @ApiOperation({
    summary: "Liveness and database check",
    description:
      '200 `{ status: "ok", database: "ok" }` when the database answers a query; 503 SERVICE_UNAVAILABLE otherwise.',
  })
  @ApiOkResponse({ description: "The API and its database answer" })
  @ApiServiceUnavailableResponse({
    description: "The database is not reachable",
  })
  check(): Promise<HealthReport> {
    return this.health.check();
  }
}
