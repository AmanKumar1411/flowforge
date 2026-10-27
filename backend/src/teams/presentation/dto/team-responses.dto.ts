import { ApiProperty } from "@nestjs/swagger";
import { CandidateAvailability, Team, TeamCandidate } from "../../domain/team";

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

  static from(candidate: TeamCandidate): TeamCandidateDto {
    return Object.assign(new TeamCandidateDto(), candidate);
  }
}
