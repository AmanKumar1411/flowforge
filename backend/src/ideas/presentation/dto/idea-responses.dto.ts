import { ApiProperty } from "@nestjs/swagger";
import type { CycleIdea } from "../../application/idea.service";
import type {
  Idea,
  IdeaDecision,
  IdeaReview,
  IdeaStatus,
  Person,
} from "../../domain/idea";

class PersonDto {
  @ApiProperty()
  id!: string;
  @ApiProperty()
  name!: string;
}

export class IdeaReviewDto {
  @ApiProperty({ description: "The version this decision was about" })
  version!: number;
  @ApiProperty({ enum: ["APPROVED", "REJECTED"] })
  decision!: IdeaDecision;
  @ApiProperty({ type: String, nullable: true })
  feedback!: string | null;
  @ApiProperty({ type: PersonDto })
  reviewer!: Person;
  @ApiProperty()
  reviewedAt!: string;

  static from(review: IdeaReview): IdeaReviewDto {
    return Object.assign(new IdeaReviewDto(), {
      ...review,
      reviewedAt: review.reviewedAt.toISOString(),
    });
  }
}

export class IdeaResponseDto {
  @ApiProperty()
  id!: string;
  @ApiProperty()
  teamId!: string;
  @ApiProperty()
  cycleId!: string;
  @ApiProperty()
  title!: string;
  @ApiProperty()
  problem!: string;
  @ApiProperty()
  solution!: string;
  @ApiProperty({ type: String, nullable: true })
  link!: string | null;
  @ApiProperty({ enum: ["SUBMITTED", "APPROVED", "REJECTED"] })
  status!: IdeaStatus;
  @ApiProperty({
    description:
      "Goes up with every change of content; send it back when reviewing",
  })
  version!: number;
  @ApiProperty({ type: PersonDto })
  submittedBy!: Person;
  @ApiProperty({ description: "When the current version was submitted" })
  submittedAt!: string;
  @ApiProperty({
    type: IdeaReviewDto,
    isArray: true,
    description: "Newest first",
  })
  reviews!: IdeaReviewDto[];

  static from(idea: Idea): IdeaResponseDto {
    return Object.assign(new IdeaResponseDto(), {
      ...idea,
      submittedAt: idea.submittedAt.toISOString(),
      reviews: idea.reviews.map((review) => IdeaReviewDto.from(review)),
    });
  }
}

export class TeamIdeaDto {
  @ApiProperty()
  teamId!: string;
  @ApiProperty({
    type: IdeaResponseDto,
    nullable: true,
    description: "Null until the leader submits one",
  })
  idea!: IdeaResponseDto | null;

  static from(teamId: string, idea: Idea | null): TeamIdeaDto {
    return Object.assign(new TeamIdeaDto(), {
      teamId,
      idea: idea ? IdeaResponseDto.from(idea) : null,
    });
  }
}

class IdeaTeamDto {
  @ApiProperty()
  id!: string;
  @ApiProperty()
  name!: string;
  @ApiProperty({ type: PersonDto })
  leader!: Person;
  @ApiProperty()
  memberCount!: number;
}

export class CycleIdeaDto {
  @ApiProperty({ type: IdeaTeamDto })
  team!: IdeaTeamDto;
  @ApiProperty({ type: IdeaResponseDto, nullable: true })
  idea!: IdeaResponseDto | null;

  static from({ team, idea }: CycleIdea): CycleIdeaDto {
    const leader = team.members.find(
      (member) => member.userId === team.leaderId,
    );
    return Object.assign(new CycleIdeaDto(), {
      team: {
        id: team.id,
        name: team.name,
        leader: { id: team.leaderId, name: leader?.name ?? "" },
        memberCount: team.members.length,
      },
      idea: idea ? IdeaResponseDto.from(idea) : null,
    });
  }
}
