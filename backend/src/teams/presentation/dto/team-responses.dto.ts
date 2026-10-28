import { ApiProperty } from "@nestjs/swagger";
import {
  AutoGroupPreview,
  CompletionOverview,
} from "../../application/team-completion.service";
import {
  CandidateAvailability,
  Team,
  TeamCandidate,
  TeamOrigin,
  UnassignedStudent,
} from "../../domain/team";

const ORIGINS: TeamOrigin[] = ["STUDENT", "FACULTY", "AUTO_GROUP"];

const AVAILABILITY: CandidateAvailability[] = [
  "AVAILABLE",
  "IN_YOUR_TEAM",
  "IN_ANOTHER_TEAM",
];

export class TeamMemberDto {
  @ApiProperty()
  userId!: string;
  @ApiProperty()
  name!: string;
  @ApiProperty()
  email!: string;
  @ApiProperty()
  isLeader!: boolean;
  @ApiProperty()
  addedAt!: string;
}

export class TeamResponseDto {
  @ApiProperty()
  id!: string;
  @ApiProperty()
  cycleId!: string;
  @ApiProperty()
  name!: string;
  @ApiProperty()
  leaderId!: string;
  @ApiProperty({ enum: ORIGINS, description: "Who formed the team" })
  origin!: TeamOrigin;
  @ApiProperty({
    type: TeamMemberDto,
    isArray: true,
    description: "Leader first",
  })
  members!: TeamMemberDto[];
  @ApiProperty()
  createdAt!: string;
  @ApiProperty()
  updatedAt!: string;

  static from(team: Team): TeamResponseDto {
    const response = new TeamResponseDto();
    response.id = team.id;
    response.cycleId = team.cycleId;
    response.name = team.name;
    response.leaderId = team.leaderId;
    response.origin = team.origin;
    response.members = team.members
      .map((member) => ({
        userId: member.userId,
        name: member.name,
        email: member.email,
        isLeader: member.userId === team.leaderId,
        addedAt: member.addedAt.toISOString(),
      }))
      .sort((a, b) => Number(b.isLeader) - Number(a.isLeader));
    response.createdAt = team.createdAt.toISOString();
    response.updatedAt = team.updatedAt.toISOString();
    return response;
  }
}

export class TeamCandidateDto {
  @ApiProperty()
  id!: string;
  @ApiProperty()
  name!: string;
  @ApiProperty()
  email!: string;
  @ApiProperty({
    enum: AVAILABILITY,
    description: "IN_ANOTHER_TEAM students cannot be added",
  })
  availability!: CandidateAvailability;
  @ApiProperty({ description: "Switched on 'Looking for a team'" })
  lookingForTeam!: boolean;
  @ApiProperty({ type: String, nullable: true })
  note!: string | null;
  @ApiProperty({
    description:
      "False for a pre-registered student who has not signed in yet; they can still be added",
  })
  signedIn!: boolean;

  static from(candidate: TeamCandidate): TeamCandidateDto {
    return Object.assign(new TeamCandidateDto(), candidate);
  }
}

export class UnassignedStudentDto {
  @ApiProperty()
  id!: string;
  @ApiProperty()
  name!: string;
  @ApiProperty()
  email!: string;
  @ApiProperty()
  lookingForTeam!: boolean;
  @ApiProperty({ type: String, nullable: true })
  note!: string | null;
  @ApiProperty({ description: "False until the student first signs in" })
  signedIn!: boolean;

  static from(student: UnassignedStudent): UnassignedStudentDto {
    return Object.assign(new UnassignedStudentDto(), student);
  }
}

export class CompletionOverviewDto {
  @ApiProperty({
    description:
      "Faculty can complete teams now: after the formation deadline, before the completion deadline",
  })
  open!: boolean;
  @ApiProperty({ type: UnassignedStudentDto, isArray: true })
  unassigned!: UnassignedStudentDto[];
  @ApiProperty({
    type: [String],
    description:
      "Elective emails enrolled before accounts were pre-registered; enrolling them again registers them so they can be placed",
  })
  notSignedIn!: string[];

  static from(overview: CompletionOverview): CompletionOverviewDto {
    return Object.assign(new CompletionOverviewDto(), {
      ...overview,
      unassigned: overview.unassigned.map(UnassignedStudentDto.from),
    });
  }
}

class PersonDto {
  @ApiProperty()
  id!: string;
  @ApiProperty()
  name!: string;
  @ApiProperty()
  email!: string;
}

class ProposedTeamPreviewDto {
  @ApiProperty()
  name!: string;
  @ApiProperty({ type: PersonDto, description: "Picked at random" })
  leader!: PersonDto;
  @ApiProperty({ type: PersonDto, isArray: true })
  members!: PersonDto[];
}

export class AutoGroupPreviewDto {
  @ApiProperty({ type: ProposedTeamPreviewDto, isArray: true })
  teams!: ProposedTeamPreviewDto[];
  @ApiProperty({
    type: PersonDto,
    isArray: true,
    description:
      "Students no valid split could place; add them to a team with room",
  })
  unplaced!: PersonDto[];

  static from(preview: AutoGroupPreview): AutoGroupPreviewDto {
    return Object.assign(new AutoGroupPreviewDto(), preview);
  }
}
