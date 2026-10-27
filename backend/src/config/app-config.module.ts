import { Global, Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AppConfig } from "./app-config";

@Global()
@Module({
  providers: [
    {
      provide: AppConfig,
      inject: [ConfigService],
      useFactory: AppConfig.fromConfigService,
    },
  ],
  exports: [AppConfig],
})
export class AppConfigModule {}
