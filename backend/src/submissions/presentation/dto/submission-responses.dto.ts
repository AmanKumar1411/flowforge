import { ApiProperty } from "@nestjs/swagger";
import { LinkResponseDto } from "../../../common/links/link.dto";
import type { CycleSubmission } from "../../application/submission.service";
import type {
  Person,
  Submission,
  SubmissionIdea,
} from "../../domain/submission";

class PersonDto {
  @ApiProperty()
  id!: string;
  @ApiProperty()
  name!: string;
}

export class SubmissionDto {
  @ApiProperty()
  id!: string;
  @ApiProperty()
  teamId!: string;
  @ApiProperty()
  cycleId!: string;
  @ApiProperty()
  milestoneId!: string;
  @ApiProperty({
    description:
      "1, 2, 3… per team and milestone; the highest is the current one",
  })
  version!: number;
  @ApiProperty({ type: LinkResponseDto, isArray: true })
  links!: LinkResponseDto[];
  @ApiProperty({ type: String, nullable: true })
  notes!: string | null;
  @ApiProperty({ type: PersonDto })
  submittedBy!: Person;
  @ApiProperty()
  submittedAt!: string;

  static from(submission: Submission): SubmissionDto {
    return Object.assign(new SubmissionDto(), {
      ...submission,
      submittedAt: submission.submittedAt.toISOString(),
    });
  }
}

class SubmissionTeamDto {
  @ApiProperty()
  id!: string;
  @ApiProperty()
  name!: string;
  @ApiProperty({ type: PersonDto })
  leader!: Person;
  @ApiProperty()
  memberCount!: number;
}

class SubmissionIdeaDto {
  @ApiProperty()
  title!: string;
  @ApiProperty({ enum: ["SUBMITTED", "APPROVED", "REJECTED"] })
  status!: SubmissionIdea["status"];
  @ApiProperty({ enum: ["PROPOSAL", "CATALOG"] })
  source!: SubmissionIdea["source"];
}

export class CycleSubmissionDto {
  @ApiProperty({ type: SubmissionTeamDto })
  team!: SubmissionTeamDto;
  @ApiProperty({ type: SubmissionIdeaDto, nullable: true })
  idea!: SubmissionIdea | null;
  @ApiProperty({
    type: SubmissionDto,
    nullable: true,
    description: "The newest version",
  })
  latest!: SubmissionDto | null;
  @ApiProperty({
    description:
      "How many versions the team has; read them from GET /teams/:teamId/milestones/:milestoneId/submissions",
  })
  versionCount!: number;

  static from({
    team,
    idea,
    latest,
    versionCount,
  }: CycleSubmission): CycleSubmissionDto {
    const leader = team.members.find(
      (member) => member.userId === team.leaderId,
    );
    return Object.assign(new CycleSubmissionDto(), {
      team: {
        id: team.id,
        name: team.name,
        leader: { id: team.leaderId, name: leader?.name ?? "" },
        memberCount: team.members.length,
      },
      idea,
      latest: latest ? SubmissionDto.from(latest) : null,
      versionCount,
    });
  }
}
