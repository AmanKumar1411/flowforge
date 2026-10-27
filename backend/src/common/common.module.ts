import { Global, Module } from "@nestjs/common";
import { APP_FILTER } from "@nestjs/core";
import { Clock, SystemClock } from "./clock";
import { ApiExceptionFilter } from "./errors/api-exception.filter";
import { CryptoRandomSource, RandomSource } from "./random";

@Global()
@Module({
  providers: [
    { provide: Clock, useClass: SystemClock },
    { provide: RandomSource, useClass: CryptoRandomSource },
    { provide: APP_FILTER, useClass: ApiExceptionFilter },
  ],
  exports: [Clock, RandomSource],
})
export class CommonModule {}
