import { Injectable } from "@nestjs/common";
import { DomainError, CommonErrorCode } from "../../common/errors/domain-error";
import { DatabaseProbe } from "./ports/database-probe";

export interface HealthReport {
  status: "ok";
  database: "ok";
}

/** Liveness for load balancers and the start script: the process answers and the database runs a query. */
@Injectable()
export class HealthService {
  constructor(private readonly database: DatabaseProbe) {}

  async check(): Promise<HealthReport> {
    try {
      await this.database.ping();
    } catch {
      throw new DomainError<CommonErrorCode>(
        "SERVICE_UNAVAILABLE",
        "The database is not reachable",
      );
    }
    return { status: "ok", database: "ok" };
  }
}
