import { ApiProperty } from "@nestjs/swagger";
import type { DemoRole } from "../../application/demo-accounts";
import type { ListedDemoAccount } from "../../application/demo-accounts.service";

export class DemoAccountDto {
  @ApiProperty({ example: "aarav.s23csai@nst.rishihood.edu.in" })
  email!: string;

  @ApiProperty({ example: "Aarav Shah" })
  name!: string;

  @ApiProperty({
    enum: ["ADMIN", "FACULTY", "STUDENT"],
    description: "The role after `npm run seed:demo`",
  })
  role!: DemoRole;

  @ApiProperty({ type: Number, nullable: true, example: 2023 })
  batchYear!: number | null;

  static from(account: ListedDemoAccount): DemoAccountDto {
    return Object.assign(new DemoAccountDto(), account);
  }
}
