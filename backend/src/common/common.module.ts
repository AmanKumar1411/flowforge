import {
  Global,
  MiddlewareConsumer,
  Module,
  NestModule,
  RequestMethod,
} from "@nestjs/common";
import { APP_FILTER } from "@nestjs/core";
import { Clock, SystemClock } from "./clock";
import { ApiExceptionFilter } from "./errors/api-exception.filter";
import { BodyDepthMiddleware } from "./http/body-depth.middleware";
import { RequestScopeMiddleware } from "./http/request-scope.middleware";
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
export class CommonModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(BodyDepthMiddleware, RequestScopeMiddleware)
      .forRoutes({ path: "*path", method: RequestMethod.ALL });
  }
}
