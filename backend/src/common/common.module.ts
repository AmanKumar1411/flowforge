import { Global, Module } from "@nestjs/common";
import { APP_FILTER } from "@nestjs/core";
import { Clock, SystemClock } from "./clock";
import { ApiExceptionFilter } from "./errors/api-exception.filter";

@Global()
@Module({
  providers: [
    { provide: Clock, useClass: SystemClock },
    { provide: APP_FILTER, useClass: ApiExceptionFilter },
  ],
  exports: [Clock],
})
export class CommonModule {}
